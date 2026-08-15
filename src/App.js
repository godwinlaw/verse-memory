/* The Memory Board — root React component.
 *
 * A single stateful component that owns progress and drives every view (board,
 * passage list, review session, leaderboard). Pure logic lives in sibling
 * modules: srs.js (scheduling), blanks.js (exercise generation), storage.js
 * (persistence), text.js (helpers). This file is the UI and state orchestration.
 *
 * Rendering uses htm (tagged-template JSX) so the design's markup transcribes
 * almost verbatim, and inline style strings are parsed by sx() at the boundary. */

import { React, html, sx, corners } from "./dom.js";
import { norm, firstLetters, dayKey } from "./text.js";
import {
  migrate, retrievability, freshness, isDue, nextStability,
  freshColor, freshBar, SEED_STABILITY, FADING_R,
} from "./srs.js";
import { keyBlankSet, chunksFor, BLANK_LEVELS, SCRAMBLE_LEVELS } from "./blanks.js";
import { storage, mergeProgress, mergeLog } from "./storage.js";
import { appConfig } from "./config.js";
import { initAuth, signIn, signOutUser, ALLOWED_DOMAIN } from "./firebase.js";
import { passages } from "../data/passages.js";

/* Mock roster for the leaderboard (until a real backend is wired up). */
const NAMES = ["Ruth Anyanwu", "Caleb Moretti", "Hannah Vos", "Dev Ramanathan", "Marta Kovač", "Isaiah Bell", "Yuki Tanabe", "Simone Okafor", "Peter Halloran", "Abigail Sørensen", "Tomás Rivera", "Grace Mbeki", "Nathan Fiore", "Elin Bergström", "Josiah Kim", "Priya Nadar"];

const MODES = [
  { key: "flip", name: "Flashcard", short: "Card", desc: "Reference first. Say it aloud, then reveal the text to check." },
  { key: "blanks", name: "Fill the blanks", short: "Blanks", desc: "The key words — verbs, actions, and names — are removed. Type what belongs there, and dial how many blanks you get." },
  { key: "type", name: "Write it out", short: "Write", desc: "Type the whole passage from memory and get it graded word by word." },
  { key: "scramble", name: "Order the phrases", short: "Order", desc: "The passage is cut into phrases and shuffled. Put them back." },
];

export class App extends React.Component {
  state = {
    loaded: false, passages: [], view: "board", progress: {}, log: {},
    mode: null, queue: [], qi: 0, phase: "prompt", revealed: false, flipLetters: false, showHelp: false,
    answers: {}, blanksChecked: false, blankLevel: 1, blankHint: true, typed: "", typeGraded: false, lastTypeScore: undefined,
    scrambleOrder: [], scrambleWrong: -1, scrambleLevel: 1, search: "", filter: "All", sessionCount: 0, peers: null,
    auth: { status: "loading" }, // loading | signing-in | signed-out | denied | signed-in | disabled
  };

  componentDidMount() {
    this.setState({
      passages,
      progress: storage.loadProgress(),
      log: storage.loadLog(),
      blankLevel: storage.loadBlankLevel(this.state.blankLevel, BLANK_LEVELS.length),
      blankHint: storage.loadBlankHint(this.state.blankHint),
      scrambleLevel: storage.loadScrambleLevel(this.state.scrambleLevel, SCRAMBLE_LEVELS.length),
      loaded: true,
      peers: this.makePeers(passages.length),
    });
    // Auth + cloud sync. Access is gated to gpmail.org Google accounts; on a
    // valid sign-in, remote progress is pulled and reconciled with local. If
    // Firebase is unreachable, status becomes "disabled" and the app runs
    // local-only rather than locking members out.
    initAuth({
      onChange: (auth) => this.setState({ auth }),
      onRemoteData: (remote) => this.hydrateRemote(remote),
    });
  }
  /* Reconcile cloud progress pulled at startup with whatever is on this device,
   * then persist the merged result (which also pushes it back to the cloud). */
  hydrateRemote(remote) {
    const progress = mergeProgress(this.state.progress, remote.progress);
    const log = mergeLog(this.state.log, remote.log);
    this.save(progress, log);
  }
  signIn() {
    this.setState({ auth: { status: "signing-in" } });
    // On success the auth observer flips status to "signed-in"; handle failure
    // (popup closed/blocked, or a non-gpmail.org account) here.
    signIn().catch((e) => {
      const denied = e && e.code === "not-allowed-domain";
      this.setState({ auth: { status: denied ? "denied" : "signed-out", error: denied ? null : "sign-in-failed" } });
    });
  }
  signOut() {
    signOutUser().catch(() => {});
  }
  makePeers(goal) {
    let s = 7; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    return NAMES.map(n => ({ name: n, count: Math.floor(Math.pow(rnd(), 1.5) * goal * 0.8) + 3, streak: Math.floor(rnd() * 40) }));
  }
  save(progress, log) {
    this.setState({ progress, log });
    storage.saveProgressAndLog(progress, log);
  }
  st(id) { return migrate(this.state.progress[id]); }
  retrievability(id) { return retrievability(this.st(id)); }
  freshness(id) { return freshness(this.st(id)); }
  isDue(id) { return isDue(this.st(id)); }
  statusOf(id) { return this.st(id).status; }
  countBy(s) { return this.state.passages.filter(p => this.statusOf(p.id) === s).length; }
  deadline() { return new Date((this.props.deadline || appConfig.deadline) + "T23:59:59"); }
  daysLeft() { return Math.max(0, Math.ceil((this.deadline() - new Date()) / 86400000)); }
  goal() { return this.state.passages.length || 167; }

  setStatus(id, status) {
    const progress = { ...this.state.progress };
    const cur = progress[id] || { hits: 0 };
    const seed = status === "memorized" && !cur.last
      ? { last: Date.now(), stability: SEED_STABILITY } // don't read as 0% fresh
      : {};
    progress[id] = { ...cur, ...seed, status, hits: status === "memorized" ? Math.max(3, cur.hits || 0) : cur.hits || 0 };
    this.save(progress, this.state.log);
  }
  record(id, ctx) {
    const progress = { ...this.state.progress };
    const prev = this.st(id); // migrated view — has stability
    const cur = progress[id] || { hits: 0, status: "new" };
    const hits = (cur.hits || 0) + 1;

    // Freshness is driven by the act of reviewing alone — no self-report. Each
    // completed review refreshes the verse; the activity and its measured
    // performance decide how much stability it gains (see srs.nextStability).
    const stability = nextStability(prev, ctx);

    progress[id] = { ...cur, hits, last: Date.now(), stability, status: hits >= 3 ? "memorized" : hits > 0 ? "learning" : "new" };
    const log = { ...this.state.log }; const k = dayKey(new Date());
    log[k] = (log[k] || 0) + 1;
    this.save(progress, log);
  }
  reviewCtx(id) {
    const s = this.state;
    return { mode: s.mode, blankLevel: s.blankLevel, score: s.lastTypeScore };
  }
  streak() {
    let n = 0; const d = new Date();
    if (!this.state.log[dayKey(d)]) d.setDate(d.getDate() - 1);
    while (this.state.log[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  dueList() {
    // Pure spaced-repetition order: stalest first. Never-reviewed verses have
    // retrievability 0, so they naturally sort to the top.
    return [...this.state.passages].sort((a, b) => this.retrievability(a.id) - this.retrievability(b.id));
  }
  start(mode, ids) {
    const list = ids && ids.length ? ids : this.dueList().slice(0, 8).map(p => p.id);
    this.setState({ view: "review", mode: mode || "flip", queue: list, qi: 0, sessionCount: 0 });
    this.resetCard();
  }
  resetCard() { this.setState({ revealed: false, flipLetters: false, showHelp: false, answers: {}, blanksChecked: false, typed: "", typeGraded: false, scrambleOrder: [], scrambleWrong: -1 }); }
  next() {
    const id = this.state.queue[this.state.qi];
    if (id != null) this.record(id, this.reviewCtx(id));
    const qi = this.state.qi + 1;
    this.setState({
      qi, sessionCount: this.state.sessionCount + 1,
      view: qi >= this.state.queue.length ? "done" : "review",
    });
    this.resetCard();
  }
  cur() { return this.state.passages.find(p => p.id === this.state.queue[this.state.qi]); }
  shuffled(arr, seed) {
    const a = arr.map((v, i) => ({ v, i })); let s = seed * 9301 + 49297;
    a.sort((x, y) => { s = (s * 1103515245 + 12345) % 2147483648; return (s % 1000) - 500; });
    return a;
  }

  renderVals() {
    const s = this.state, goal = this.goal(), memorized = this.countBy("memorized"), learning = this.countBy("learning");
    const remaining = goal - memorized - learning, pct = goal ? Math.round(memorized / goal * 100) : 0, daysLeft = this.daysLeft();
    const weeksLeft = Math.max(1, daysLeft / 7), perWeek = Math.ceil((goal - memorized) / weeksLeft);
    const nav = [["board", "Board"], ["list", "Passages"], ["leaderboard", "Leaderboard"]].map(([k, label]) => ({
      label, onClick: () => this.setState({ view: k }),
      style: "background:none;border:none;cursor:pointer;font-family:var(--font-heading);font-weight:600;font-size:15px;letter-spacing:.06em;padding:4px 2px;border-bottom:2px solid " + (s.view === k || (k === "board" && s.view === "done") ? "var(--color-accent)" : "transparent") + ";color:" + (s.view === k ? "var(--color-text)" : "color-mix(in srgb, var(--color-text) 55%, transparent)"),
    }));
    const tag = (st) => st === "memorized" ? "display:inline-flex;font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:3px 9px;background:var(--color-accent-900);color:#f2f2f3"
      : st === "learning" ? "display:inline-flex;font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:3px 9px;background:var(--color-accent-200);color:var(--color-accent-800)"
      : "display:inline-flex;font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:3px 9px;border:1px solid var(--color-divider);color:color-mix(in srgb, var(--color-text) 55%, transparent)";
    const label = { memorized: "Committed", learning: "In progress", new: "Not started" };

    const dueRanked = this.dueList();
    const dueOnly = dueRanked.filter(p => this.isDue(p.id));
    const due = (dueOnly.length ? dueOnly : dueRanked).slice(0, 6);
    const heroCell = "padding:22px 24px;display:flex;flex-direction:column;gap:6px;border-bottom:1px solid rgba(242,242,243,.25);border-right:1px solid rgba(242,242,243,.25)";

    const logDays = []; for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); logDays.push({ d, n: s.log[dayKey(d)] || 0 }); }
    const maxDay = Math.max(4, ...logDays.map(x => x.n));

    const peers = (s.peers || []).concat([{ name: "You", count: memorized, streak: this.streak(), me: true }]).sort((a, b) => b.count - a.count);
    const topCount = Math.max(1, peers[0] ? peers[0].count : 1);

    const filtered = s.passages.filter(p => {
      const st = this.statusOf(p.id);
      if (s.filter === "Committed" && st !== "memorized") return false;
      if (s.filter === "In progress" && st !== "learning") return false;
      if (s.filter === "Not started" && st !== "new") return false;
      const q = s.search.trim().toLowerCase();
      return !q || p.ref.toLowerCase().includes(q) || p.text.toLowerCase().includes(q);
    });

    const cur = this.cur(), curText = cur ? cur.text : "";
    const words = curText ? curText.split(" ") : [];
    const blanks = keyBlankSet(curText, cur ? cur.id : null, s.blankLevel);
    const blankIdx = words.map((w, i) => (blanks.has(i) ? i : -1)).filter(i => i >= 0);
    const focusBlank = idx => { const el = idx != null && document.getElementById("blank-" + idx); if (el) el.focus(); };
    const blankWords = words.map((w, i) => {
      const isBlank = blanks.has(i);
      const ok = isBlank && norm(s.answers[i] || "") === norm(w);
      const pos = isBlank ? blankIdx.indexOf(i) : -1;
      const nextIdx = pos >= 0 && pos < blankIdx.length - 1 ? blankIdx[pos + 1] : null;
      const target = norm(w).length;
      return {
        word: w, isBlank, isPlain: !isBlank, id: "blank-" + i, hint: s.blankHint ? norm(w)[0] + "—" : "", value: s.answers[i] || "",
        wrapStyle: "display:inline-flex;align-items:baseline",
        inputStyle: "width:" + Math.max(64, norm(w).length * 13) + "px;font:inherit;font-size:19px;padding:0 4px;background:transparent;color:var(--color-text);border:0;border-bottom:1px solid " + (s.blanksChecked ? (ok ? "var(--color-accent)" : "#a4553f") : "var(--color-neutral-400)") + ";outline:none",
        onChange: e => {
          const val = e.target.value;
          // auto-advance to the next blank once this word is fully typed
          this.setState({ answers: { ...s.answers, [i]: val } }, () => {
            if (nextIdx != null && target > 0 && norm(val).length >= target) focusBlank(nextIdx);
          });
        },
        onKeyDown: e => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); focusBlank(nextIdx); }
        },
      };
    });
    const blanksTotal = blankWords.filter(w => w.isBlank).length;
    const blanksRight = blankWords.filter(w => w.isBlank && norm(w.value) === norm(w.word)).length;

    const typedWords = s.typed.split(/\s+/).filter(Boolean).map(norm);
    let ti = 0; const typeDiff = words.map(w => {
      const hit = typedWords[ti] === norm(w) ? true : typedWords.indexOf(norm(w), ti) > -1 && typedWords.indexOf(norm(w), ti) < ti + 3;
      if (hit) ti = Math.max(ti + 1, typedWords.indexOf(norm(w), ti) + 1);
      return { word: w, style: hit ? "color:var(--color-text)" : "color:#a4553f;text-decoration:underline;text-decoration-style:wavy;text-underline-offset:4px" };
    });
    const typeHits = typeDiff.filter(d => d.style.indexOf("a4553f") < 0).length;

    const chunks = curText ? chunksFor(curText, s.scrambleLevel) : [];
    const shuf = this.shuffled(chunks, (cur ? cur.id : 1) * 13);
    const placed = s.scrambleOrder;
    const scrambleChunks = shuf.filter(c => !placed.includes(c.i)).map(c => ({
      text: c.v, onClick: () => {
        if (c.i === placed.length) this.setState({ scrambleOrder: [...placed, c.i], scrambleWrong: -1 });
        else this.setState({ scrambleWrong: c.i });
      },
      style: "cursor:pointer;font-family:var(--font-body);font-size:15px;line-height:1.5;text-align:left;max-width:340px;padding:9px 13px;background:transparent;color:var(--color-text);border:1px solid " + (s.scrambleWrong === c.i ? "#a4553f" : "var(--color-divider)") + ";" + (s.scrambleWrong === c.i ? "animation:nudge .25s" : ""),
    }));
    const scrambleDone = chunks.length > 0 && placed.length === chunks.length;

    return {
      groupName: this.props.groupName ?? appConfig.groupName,
      user: s.auth.user || null,
      signOut: () => this.signOut(),
      goal, memorized, learning, remaining, pctLabel: pct + "%",
      deadlineLabel: this.deadline().toLocaleDateString("en-GB", { day: "numeric", month: "long" }),
      barStyle: "position:absolute;inset:0 auto 0 0;width:" + pct + "%;background:#f2f2f3",
      nav, isBoard: s.view === "board", isList: s.view === "list", isReview: s.view === "review", isLeader: s.view === "leaderboard", isDone: s.view === "done",
      goBoard: () => this.setState({ view: "board" }), goList: () => this.setState({ view: "list" }),
      startDue: () => this.start(s.mode || "flip"),
      heroStats: [
        { label: "Days left", value: daysLeft, note: "until " + this.deadline().toLocaleDateString("en-GB", { day: "numeric", month: "short" }), style: heroCell },
        { label: "Pace needed", value: perWeek, note: "passages a week", style: heroCell + ";border-right:none" },
        { label: "Reviewed today", value: s.log[dayKey(new Date())] || 0, note: "cards handled", style: heroCell + ";border-bottom:none" },
        { label: "Streak", value: this.streak(), note: "days running", style: heroCell + ";border-bottom:none;border-right:none" },
      ],
      dueCount: due.length,
      queue: due.map((p, i) => ({
        num: String(p.id).padStart(3, "0"), ref: p.ref, snippet: p.text.slice(0, 90),
        statusLabel: label[this.statusOf(p.id)], tagStyle: tag(this.statusOf(p.id)),
        freshLabel: this.st(p.id).last ? this.freshness(p.id) + "%" : "new",
        freshStyle: "font-family:var(--font-heading);font-size:12px;font-weight:600;width:44px;flex:none;text-align:right;color:" + (this.st(p.id).last ? freshColor(this.freshness(p.id)) : "color-mix(in srgb, var(--color-text) 45%, transparent)"),
        style: "display:flex;align-items:center;gap:14px;padding:13px 18px;background:transparent;border:none;cursor:pointer;font-family:var(--font-body);color:var(--color-text)" + (i ? ";border-top:1px solid var(--color-divider)" : ""),
        onClick: () => this.start(s.mode || "flip", [p.id]),
      })),
      modes: MODES.map((m, i) => ({ ...m, index: "0" + (i + 1), onClick: () => this.start(m.key) })),
      mapCells: s.passages.map(p => {
        const st = this.statusOf(p.id);
        const reviewed = !!this.st(p.id).last;
        const fresh = this.freshness(p.id);
        // Fade reviewed tiles as freshness decays, so stale verses visibly dim.
        const fade = st !== "new" && reviewed ? ";opacity:" + (0.4 + 0.6 * fresh / 100).toFixed(2) : "";
        return {
          title: p.ref + " — " + label[st] + (reviewed ? " · " + fresh + "% fresh" : ""), onClick: () => this.start(s.mode || "flip", [p.id]),
          style: "aspect-ratio:1;padding:0;cursor:pointer;border:1px solid " + (st === "new" ? "var(--color-divider)" : "transparent") + ";background:" + (st === "memorized" ? "var(--color-accent-900)" : st === "learning" ? "var(--color-accent-300)" : "transparent") + fade,
        };
      }),
      dayBars: logDays.map(x => ({
        title: x.d.toDateString() + ": " + x.n,
        style: "flex:1;background:" + (x.n ? "var(--color-accent)" : "var(--color-neutral-200)") + ";height:" + Math.max(3, Math.round(x.n / maxDay * 100)) + "%",
      })),
      barsFrom: logDays[0].d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      paceHeadline: memorized >= goal ? "All of them. Well done." : perWeek + " a week from here",
      paceBody: memorized >= goal ? "Every passage is committed. Keep reviewing so they stay that way."
        : "You have " + (goal - memorized) + " passages left and " + daysLeft + " days. That is about " + perWeek + " newly committed each week, plus review of what you already hold. A passage counts as committed after three clean reviews.",
      shownCount: filtered.length, search: s.search, onSearch: e => this.setState({ search: e.target.value }),
      statusTabs: ["All", "Not started", "In progress", "Committed"].map(t => ({
        label: t, onClick: () => this.setState({ filter: t }),
        style: "padding:7px 13px;font-size:13px;font-family:var(--font-body);cursor:pointer;border:none;border-left:1px solid var(--color-divider);background:" + (s.filter === t ? "var(--color-accent)" : "transparent") + ";color:" + (s.filter === t ? "var(--color-bg)" : "var(--color-text)"),
      })),
      rows: filtered.map((p, i) => {
        const st = this.statusOf(p.id);
        const reviewed = !!this.st(p.id).last;
        const fresh = this.freshness(p.id);
        return {
          num: String(p.id).padStart(3, "0"), ref: p.ref, snippet: p.text.slice(0, 120),
          statusLabel: label[st], tagStyle: tag(st),
          fading: st === "memorized" && reviewed && fresh < FADING_R * 100,
          freshLabel: reviewed ? fresh + "%" : "—",
          freshColor: reviewed ? freshColor(fresh) : "color-mix(in srgb, var(--color-text) 45%, transparent)",
          freshBarStyle: reviewed ? freshBar(fresh) : "height:6px;border-radius:3px;background:var(--color-fresh-track)",
          rowStyle: "display:grid;grid-template-columns:56px 190px 1fr 110px 130px 210px;gap:0;align-items:center;padding:11px 18px" + (i ? ";border-top:1px solid color-mix(in srgb, var(--color-text) 8%, transparent)" : ""),
          toggleLabel: st === "memorized" ? "Un-commit" : "Mark committed",
          onToggle: () => this.setStatus(p.id, st === "memorized" ? "learning" : "memorized"),
          onReview: () => this.start(s.mode || "flip", [p.id]),
          id: p.id,
        };
      }),
      modeName: (MODES.find(m => m.key === s.mode) || MODES[0]).name,
      posLabel: "Passage " + Math.min(s.qi + 1, s.queue.length) + " of " + s.queue.length,
      modeSwitch: MODES.map(m => ({
        short: m.short, key: m.key, onClick: () => { this.setState({ mode: m.key }); this.resetCard(); },
        style: "padding:5px 11px;font-size:12px;font-family:var(--font-heading);font-weight:600;letter-spacing:.06em;cursor:pointer;border:1px solid var(--color-divider);background:" + (s.mode === m.key ? "var(--color-accent)" : "transparent") + ";color:" + (s.mode === m.key ? "var(--color-bg)" : "var(--color-text)"),
      })),
      sessionBarStyle: "height:100%;background:var(--color-accent);width:" + (s.queue.length ? Math.round(s.qi / s.queue.length * 100) : 0) + "%",
      curRef: cur ? cur.ref : "", curText,
      curMeta: cur ? (cur.testament === "OT" ? "Old Testament" : "New Testament") + " · " + words.length + " words" : "",
      curProgressNote: cur ? (this.st(cur.id).hits || 0) + " of 3 clean reviews" : "",
      helpLabel: "Peek",
      peekOn: () => this.setState({ showHelp: true }),
      peekOff: () => this.setState({ showHelp: false }),
      showHelp: s.showHelp && s.mode !== "flip",
      isFlip: s.mode === "flip", flipHidden: s.mode === "flip" && !s.revealed, flipShown: s.mode === "flip" && s.revealed,
      reveal: () => this.setState({ revealed: true }),
      hide: () => this.setState({ revealed: false }),
      flipLettersOn: s.flipLetters, flipFirstLetters: firstLetters(curText),
      toggleFlipLetters: () => this.setState({ flipLetters: !s.flipLetters }),
      isBlanks: s.mode === "blanks", blankWords,
      checkBlanks: () => this.setState({ blanksChecked: true }),
      blanksResult: s.blanksChecked ? blanksRight + " of " + blanksTotal + " right" : blanksTotal + " blanks",
      blankLevels: BLANK_LEVELS.map((lv, i) => ({
        label: lv.label, key: lv.key, active: i === s.blankLevel,
        onClick: () => { storage.saveBlankLevel(i); this.setState({ blankLevel: i, answers: {}, blanksChecked: false }); },
        style: "padding:5px 11px;font-size:12px;font-family:var(--font-heading);font-weight:600;letter-spacing:.06em;cursor:pointer;border:1px solid var(--color-divider);background:" + (i === s.blankLevel ? "var(--color-accent)" : "transparent") + ";color:" + (i === s.blankLevel ? "var(--color-bg)" : "var(--color-text)"),
      })),
      blankLevelDesc: "Blanking " + (BLANK_LEVELS[s.blankLevel] || BLANK_LEVELS[1]).desc,
      blankHintOn: s.blankHint,
      toggleBlankHint: () => { const on = !s.blankHint; storage.saveBlankHint(on); this.setState({ blankHint: on }); },
      blankHintStyle: "padding:5px 11px;font-size:12px;font-family:var(--font-heading);font-weight:600;letter-spacing:.06em;cursor:pointer;border:1px solid var(--color-divider);background:" + (s.blankHint ? "var(--color-accent)" : "transparent") + ";color:" + (s.blankHint ? "var(--color-bg)" : "var(--color-text)"),
      isType: s.mode === "type", typed: s.typed, onTyped: e => this.setState({ typed: e.target.value }),
      typeUngraded: s.mode === "type" && !s.typeGraded, typeGraded: s.mode === "type" && s.typeGraded,
      typeButtonLabel: s.typeGraded ? "Try again" : "Grade it",
      checkTyped: () => this.setState(st => ({ typeGraded: !st.typeGraded, typed: st.typeGraded ? "" : st.typed, lastTypeScore: words.length ? typeHits / words.length : 0 })),
      typeScore: words.length ? Math.round(typeHits / words.length * 100) + "%" : "—", typeDiff,
      isScramble: s.mode === "scramble", scrambleChunks,
      scrambleBuilt: placed.map(i => chunks[i]).join(" "), scrambleEmpty: placed.length === 0,
      scrambleResult: scrambleDone ? "Complete — in order." : placed.length + " of " + chunks.length + " placed",
      resetScramble: () => this.setState({ scrambleOrder: [], scrambleWrong: -1 }),
      scrambleLevels: SCRAMBLE_LEVELS.map((lv, i) => ({
        label: lv.label, key: lv.key, active: i === s.scrambleLevel,
        onClick: () => { storage.saveScrambleLevel(i); this.setState({ scrambleLevel: i, scrambleOrder: [], scrambleWrong: -1 }); },
        style: "padding:5px 11px;font-size:12px;font-family:var(--font-heading);font-weight:600;letter-spacing:.06em;cursor:pointer;border:1px solid var(--color-divider);background:" + (i === s.scrambleLevel ? "var(--color-accent)" : "transparent") + ";color:" + (i === s.scrambleLevel ? "var(--color-bg)" : "var(--color-text)"),
      })),
      scrambleLevelDesc: "Cutting into " + (SCRAMBLE_LEVELS[s.scrambleLevel] || SCRAMBLE_LEVELS[1]).desc,
      advance: () => this.next(),
      endSession: () => this.setState({ view: "board" }),
      doneHeadline: s.sessionCount + (s.sessionCount === 1 ? " passage refreshed" : " passages refreshed"),
      doneBody: "Every passage you reviewed is fresh again. " + memorized + " of " + goal + " are committed, with " + daysLeft + " days to go.",
      daysLeftLabel: daysLeft + " days remaining",
      podium: peers.slice(0, 3).map((p, i) => ({
        place: ["First", "Second", "Third"][i], name: p.name, count: p.count,
        cardStyle: "padding:20px 22px;display:flex;flex-direction:column;gap:8px;" + (p.me ? "background:var(--color-accent-900);color:#f2f2f3;border-color:var(--color-accent-900)" : ""),
      })),
      board: peers.map((p, i) => ({
        rank: i + 1, name: p.name, count: p.count, streak: p.streak + " days",
        rowStyle: p.me ? "background:var(--color-accent-100)" : "",
        barStyle: "height:100%;background:" + (p.me ? "var(--color-accent-900)" : "var(--color-accent)") + ";width:" + Math.round(p.count / topCount * 100) + "%",
      })),
    };
  }

  /* ── template (transcribed from the design's x-dc markup) ───────────────── */
  header(v) {
    return html`
      <div style=${sx("display:flex;align-items:center;gap:32px;padding:16px 36px;border-bottom:1px solid var(--color-divider);position:sticky;top:0;background:var(--color-bg);z-index:20")}>
        <div style=${sx("display:flex;flex-direction:column;gap:1px;margin-right:auto")}>
          <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:19px;letter-spacing:.08em")}>THE MEMORY BOARD</div>
          <div style=${sx("font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 50%, transparent)")}>${v.groupName} · ESV</div>
        </div>
        ${v.nav.map((n, i) => html`<button key=${i} onClick=${n.onClick} style=${sx(n.style)}>${n.label}</button>`)}
        <button className="btn btn-primary" onClick=${v.startDue} style=${sx("letter-spacing:.06em")}>REVIEW NOW</button>
        ${v.user && html`
          <div style=${sx("display:flex;align-items:center;gap:10px;padding-left:16px;margin-left:4px;border-left:1px solid var(--color-divider)")}>
            <span title=${v.user.email} style=${sx("font-size:12px;color:color-mix(in srgb, var(--color-text) 60%, transparent);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>${v.user.email}</span>
            <button className="btn btn-secondary" onClick=${v.signOut} style=${sx("font-size:12px;padding:4px 10px")}>Sign out</button>
          </div>`}
      </div>`;
  }

  /* Login gate shown until an approved gpmail.org member is signed in. */
  authGate(a) {
    const busy = a.status === "loading" || a.status === "signing-in";
    const denied = a.status === "denied";
    const failed = a.status === "signed-out" && a.error === "sign-in-failed";
    return html`
      <div style=${sx("min-height:100vh;background:var(--color-bg);color:var(--color-text);font-family:var(--font-body);display:flex;align-items:center;justify-content:center;padding:36px")}>
        <div className="blueprint" style=${sx("max-width:460px;width:100%;padding:40px 40px 36px;display:flex;flex-direction:column;gap:18px")}>
          ${corners()}
          <div style=${sx("display:flex;flex-direction:column;gap:2px")}>
            <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:22px;letter-spacing:.06em")}>THE MEMORY BOARD</div>
            <div style=${sx("font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 55%, transparent)")}>${this.props.groupName ?? appConfig.groupName}</div>
          </div>
          <p style=${sx("margin:0;font-size:14px;line-height:1.6;color:color-mix(in srgb, var(--color-text) 70%, transparent)")}>
            Sign in with your <strong>@${ALLOWED_DOMAIN}</strong> account to track your passages and sync across devices.
          </p>
          ${denied && html`<div style=${sx("font-size:13px;line-height:1.55;padding:10px 12px;border:1px solid #a4553f;color:#a4553f")}>That account isn't part of ${ALLOWED_DOMAIN}. Please sign in with your Acts 2 Network (@${ALLOWED_DOMAIN}) account.</div>`}
          ${failed && html`<div style=${sx("font-size:13px;line-height:1.55;padding:10px 12px;border:1px solid #a4553f;color:#a4553f")}>Sign-in didn't complete. Please try again.</div>`}
          <button className="btn btn-primary" onClick=${() => this.signIn()} disabled=${busy} style=${sx("align-self:flex-start;letter-spacing:.04em" + (busy ? ";opacity:.6;cursor:default" : ""))}>
            ${busy ? "Connecting…" : "Sign in with Google"}
          </button>
        </div>
      </div>`;
  }

  boardView(v) {
    return html`
      <div style=${sx("max-width:1280px;margin:0 auto;padding:40px 36px 80px;display:flex;flex-direction:column;gap:40px")}>

        <div className="blueprint" style=${sx("display:grid;grid-template-columns:1.3fr 1fr;background:var(--color-accent-900);color:#f2f2f3;border-color:var(--color-accent-900)")}>
          ${corners()}
          <div style=${sx("padding:36px 40px 32px;display:flex;flex-direction:column;gap:22px")}>
            <div style=${sx("font-size:11px;letter-spacing:.16em;text-transform:uppercase;opacity:.72")}>Progress to ${v.deadlineLabel}</div>
            <div style=${sx("display:flex;align-items:flex-end;gap:16px")}>
              <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:112px;line-height:.82;letter-spacing:-.02em")}>${v.memorized}</div>
              <div style=${sx("display:flex;flex-direction:column;gap:2px;padding-bottom:8px")}>
                <div style=${sx("font-family:var(--font-heading);font-size:26px;line-height:1;opacity:.7")}>/ ${v.goal}</div>
                <div style=${sx("font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.6")}>passages committed</div>
              </div>
            </div>
            <div style=${sx("height:10px;border:1px solid rgba(242,242,243,.4);position:relative")}>
              <div style=${sx(v.barStyle)}></div>
            </div>
            <div style=${sx("display:flex;gap:28px;font-size:12px;opacity:.75")}>
              <div>${v.learning} in progress</div>
              <div>${v.remaining} not started</div>
              <div>${v.pctLabel} of the goal</div>
            </div>
          </div>
          <div style=${sx("display:grid;grid-template-columns:1fr 1fr;border-left:1px solid rgba(242,242,243,.25)")}>
            ${v.heroStats.map((st, i) => html`
              <div key=${i} style=${sx(st.style)}>
                <div style=${sx("font-size:10px;letter-spacing:.14em;text-transform:uppercase;opacity:.6")}>${st.label}</div>
                <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:40px;line-height:1")}>${st.value}</div>
                <div style=${sx("font-size:11px;opacity:.6")}>${st.note}</div>
              </div>`)}
          </div>
        </div>

        <div style=${sx("display:grid;grid-template-columns:1.15fr 1fr;gap:32px;align-items:start")}>
          <div style=${sx("display:flex;flex-direction:column;gap:14px")}>
            <div style=${sx("display:flex;align-items:baseline;gap:12px")}>
              <h4 style=${sx("margin:0;letter-spacing:.02em")}>Due today</h4>
              <div style=${sx("font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 50%, transparent)")}>${v.dueCount} passages</div>
            </div>
            <div className="blueprint" style=${sx("display:flex;flex-direction:column")}>
              ${corners()}
              ${v.queue.map((q, i) => html`
                <button key=${i} onClick=${q.onClick} style=${sx(q.style)}>
                  <span style=${sx("font-family:var(--font-heading);font-size:11px;letter-spacing:.1em;width:34px;flex:none;opacity:.5;text-align:left")}>${q.num}</span>
                  <span style=${sx("font-family:var(--font-heading);font-weight:600;font-size:16px;width:170px;flex:none;text-align:left")}>${q.ref}</span>
                  <span style=${sx("font-size:13px;flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:color-mix(in srgb, var(--color-text) 60%, transparent)")}>${q.snippet}</span>
                  <span style=${sx(q.freshStyle)}>${q.freshLabel}</span>
                  <span style=${sx(q.tagStyle)}>${q.statusLabel}</span>
                </button>`)}
            </div>
          </div>

          <div style=${sx("display:flex;flex-direction:column;gap:14px")}>
            <h4 style=${sx("margin:0;letter-spacing:.02em")}>Ways to review</h4>
            <div style=${sx("display:grid;grid-template-columns:1fr 1fr;gap:14px")}>
              ${v.modes.map((m, i) => html`
                <button key=${i} className="blueprint" onClick=${m.onClick} style=${sx("background:transparent;cursor:pointer;padding:18px 16px;display:flex;flex-direction:column;gap:6px;text-align:left;font-family:var(--font-body);color:var(--color-text)")}>
                  ${corners()}
                  <div style=${sx("font-family:var(--font-heading);font-size:11px;letter-spacing:.14em;color:var(--color-accent-700)")}>${m.index}</div>
                  <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:19px;line-height:1.1")}>${m.name}</div>
                  <div style=${sx("font-size:12px;line-height:1.45;color:color-mix(in srgb, var(--color-text) 58%, transparent)")}>${m.desc}</div>
                </button>`)}
            </div>
          </div>
        </div>

        <div style=${sx("display:flex;flex-direction:column;gap:16px")}>
          <div style=${sx("display:flex;align-items:baseline;gap:12px")}>
            <h4 style=${sx("margin:0;letter-spacing:.02em")}>The whole set</h4>
            <div style=${sx("font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 50%, transparent)")}>one cell per passage, in canonical order</div>
            <div style=${sx("margin-left:auto;display:flex;gap:18px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 55%, transparent)")}>
              <span style=${sx("display:flex;align-items:center;gap:6px")}><i style=${sx("width:10px;height:10px;background:var(--color-accent-900);display:block")}></i>committed</span>
              <span style=${sx("display:flex;align-items:center;gap:6px")}><i style=${sx("width:10px;height:10px;background:var(--color-accent-300);display:block")}></i>in progress</span>
              <span style=${sx("display:flex;align-items:center;gap:6px")}><i style=${sx("width:10px;height:10px;border:1px solid var(--color-divider);display:block")}></i>not started</span>
            </div>
          </div>
          <div className="blueprint" style=${sx("padding:22px")}>
            ${corners()}
            <div style=${sx("display:grid;grid-template-columns:repeat(28,1fr);gap:5px")}>
              ${v.mapCells.map((c, i) => html`<button key=${i} title=${c.title} onClick=${c.onClick} style=${sx(c.style)}></button>`)}
            </div>
          </div>
        </div>

        <div style=${sx("display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:start")}>
          <div style=${sx("display:flex;flex-direction:column;gap:14px")}>
            <h4 style=${sx("margin:0;letter-spacing:.02em")}>Last 14 days</h4>
            <div className="blueprint" style=${sx("padding:20px 22px 16px;display:flex;flex-direction:column;gap:10px")}>
              ${corners()}
              <div style=${sx("display:flex;align-items:flex-end;gap:6px;height:110px")}>
                ${v.dayBars.map((d, i) => html`<div key=${i} title=${d.title} style=${sx(d.style)}></div>`)}
              </div>
              <div style=${sx("display:flex;justify-content:space-between;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 45%, transparent)")}>
                <span>${v.barsFrom}</span><span>reviews per day</span><span>today</span>
              </div>
            </div>
          </div>
          <div style=${sx("display:flex;flex-direction:column;gap:14px")}>
            <h4 style=${sx("margin:0;letter-spacing:.02em")}>Pace check</h4>
            <div className="blueprint" style=${sx("padding:22px 24px;display:flex;flex-direction:column;gap:14px")}>
              ${corners()}
              <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:28px;line-height:1.15")}>${v.paceHeadline}</div>
              <p style=${sx("margin:0;font-size:13px;line-height:1.6;color:color-mix(in srgb, var(--color-text) 65%, transparent)")}>${v.paceBody}</p>
              <div style=${sx("display:flex;gap:10px;margin-top:2px")}>
                <button className="btn btn-primary" onClick=${v.startDue}>Start a session</button>
                <button className="btn btn-secondary" onClick=${v.goList}>Browse all ${v.goal}</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  listView(v) {
    return html`
      <div style=${sx("max-width:1280px;margin:0 auto;padding:40px 36px 80px;display:flex;flex-direction:column;gap:24px")}>
        <div style=${sx("display:flex;align-items:flex-end;gap:20px;flex-wrap:wrap")}>
          <div>
            <h2 style=${sx("margin:0")}>All passages</h2>
            <div style=${sx("font-size:13px;color:color-mix(in srgb, var(--color-text) 55%, transparent)")}>${v.shownCount} shown · ${v.memorized} committed · ${v.remaining} untouched</div>
          </div>
          <div style=${sx("margin-left:auto;display:flex;gap:12px;align-items:center")}>
            <input className="input" placeholder="Search reference or text" value=${v.search} onChange=${v.onSearch} style=${sx("width:260px")} />
            <div className="seg">
              ${v.statusTabs.map((t, i) => html`<button key=${i} onClick=${t.onClick} style=${sx(t.style)}>${t.label}</button>`)}
            </div>
          </div>
        </div>

        <div className="blueprint" style=${sx("padding:0")}>
          ${corners()}
          <div style=${sx("display:grid;grid-template-columns:56px 190px 1fr 110px 130px 210px;gap:0;padding:10px 18px;border-bottom:1px solid var(--color-divider);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 55%, transparent)")}>
            <div>No.</div><div>Reference</div><div>Opening words</div><div>Freshness</div><div>Status</div><div style=${sx("text-align:right")}>Action</div>
          </div>
          ${v.rows.map(r => html`
            <div key=${r.id} style=${sx(r.rowStyle)}>
              <div style=${sx("font-family:var(--font-heading);font-size:12px;letter-spacing:.08em;color:color-mix(in srgb, var(--color-text) 45%, transparent)")}>${r.num}</div>
              <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:17px")}>${r.ref}</div>
              <div style=${sx("font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:color-mix(in srgb, var(--color-text) 62%, transparent);padding-right:20px")}>${r.snippet}</div>
              <div style=${sx("padding-right:20px;display:flex;flex-direction:column;gap:4px")}>
                <span style=${sx("font-family:var(--font-heading);font-size:12px;font-weight:600;color:" + r.freshColor)}>${r.freshLabel}</span>
                <div style=${sx(r.freshBarStyle)}></div>
              </div>
              <div style=${sx("display:flex;align-items:center;gap:6px")}>
                <span style=${sx(r.tagStyle)}>${r.statusLabel}</span>
                ${r.fading ? html`<span style=${sx("font-size:9px;letter-spacing:.1em;text-transform:uppercase;padding:2px 6px;color:" + freshColor(50) + ";border:1px solid " + freshColor(50))}>Fading</span>` : null}
              </div>
              <div style=${sx("display:flex;gap:8px;justify-content:flex-end")}>
                <button className="btn btn-secondary" onClick=${r.onReview} style=${sx("font-size:12px;padding:4px 10px")}>Review</button>
                <button className="btn btn-secondary" onClick=${r.onToggle} style=${sx("font-size:12px;padding:4px 10px")}>${r.toggleLabel}</button>
              </div>
            </div>`)}
        </div>
      </div>`;
  }

  reviewView(v) {
    return html`
      <div style=${sx("max-width:1000px;margin:0 auto;padding:36px 36px 80px;display:flex;flex-direction:column;gap:22px")}>

        <div style=${sx("display:flex;align-items:center;gap:16px")}>
          <button className="btn btn-secondary" onClick=${v.endSession} style=${sx("font-size:12px;padding:4px 12px")}>Leave session</button>
          <div style=${sx("font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 55%, transparent)")}>${v.modeName} · ${v.posLabel}</div>
          <div style=${sx("margin-left:auto;display:flex;gap:6px")}>
            ${v.modeSwitch.map(m => html`<button key=${m.key} onClick=${m.onClick} style=${sx(m.style)}>${m.short}</button>`)}
          </div>
        </div>

        <div style=${sx("height:4px;background:var(--color-neutral-200)")}>
          <div style=${sx(v.sessionBarStyle)}></div>
        </div>

        <div className="blueprint" style=${sx("padding:40px 44px;display:flex;flex-direction:column;gap:26px;min-height:400px")}>
          ${corners()}

          <div style=${sx("display:flex;align-items:baseline;gap:14px;border-bottom:1px solid var(--color-divider);padding-bottom:14px")}>
            <h2 style=${sx("margin:0")}>${v.curRef}</h2>
            <div style=${sx("font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 50%, transparent)")}>${v.curMeta}</div>
            ${!v.isFlip && html`<button className="btn btn-ghost" onMouseDown=${v.peekOn} onMouseUp=${v.peekOff} onMouseLeave=${v.peekOff} onTouchStart=${v.peekOn} onTouchEnd=${v.peekOff} style=${sx("margin-left:auto;font-size:12px;user-select:none;touch-action:none")}>${v.helpLabel}</button>`}
          </div>

          ${v.isFlip && html`
            <div style=${sx("display:flex;flex-direction:column;gap:26px")}>
              ${v.flipHidden && html`
                <div style=${sx("display:flex;flex-direction:column;align-items:center;gap:18px;padding:44px 0")}>
                  ${v.flipLettersOn
                    ? html`<p style=${sx("margin:0;font-size:21px;line-height:1.9;max-width:74ch;letter-spacing:.06em;font-family:var(--font-heading);color:var(--color-text)")}>${v.flipFirstLetters}</p>`
                    : html`<div style=${sx("font-size:13px;color:color-mix(in srgb, var(--color-text) 55%, transparent);text-align:center;max-width:420px")}>Say it aloud from memory, then reveal to check yourself.</div>`}
                  <div style=${sx("display:flex;gap:10px;align-items:center")}>
                    <button className="btn btn-secondary" onClick=${v.toggleFlipLetters}>${v.flipLettersOn ? "Hide first letters" : "Show first letters"}</button>
                    <button className="btn btn-primary" onClick=${v.reveal}>Reveal the passage</button>
                  </div>
                </div>`}
              ${v.flipShown && html`
                <div style=${sx("display:flex;flex-direction:column;gap:22px")}>
                  <p style=${sx("margin:0;font-size:21px;line-height:1.62;max-width:74ch")}>${v.curText}</p>
                  <div><button className="btn btn-secondary" onClick=${v.hide}>Hide the passage</button></div>
                </div>`}
            </div>`}

          ${v.isBlanks && html`
            <div style=${sx("display:flex;flex-direction:column;gap:20px")}>
              <div style=${sx("display:flex;align-items:center;gap:10px;flex-wrap:wrap")}>
                <span style=${sx("font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 55%, transparent)")}>Blanks</span>
                <div style=${sx("display:flex;gap:6px")}>
                  ${v.blankLevels.map(lv => html`<button key=${lv.key} onClick=${lv.onClick} style=${sx(lv.style)}>${lv.label}</button>`)}
                </div>
                <span style=${sx("font-size:12px;color:color-mix(in srgb, var(--color-text) 55%, transparent)")}>${v.blankLevelDesc}</span>
                <span style=${sx("width:1px;height:20px;background:var(--color-divider);margin:0 4px")}></span>
                <span style=${sx("font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 55%, transparent)")}>First letter</span>
                <button onClick=${v.toggleBlankHint} style=${sx(v.blankHintStyle)}>${v.blankHintOn ? "On" : "Off"}</button>
              </div>
              <div style=${sx("font-size:21px;line-height:2.1;max-width:74ch;display:flex;flex-wrap:wrap;gap:0 7px;align-items:baseline")}>
                ${v.blankWords.map((w, i) => html`
                  <span key=${i} style=${sx(w.wrapStyle)}>${w.isBlank
                    ? html`<input id=${w.id} value=${w.value} onChange=${w.onChange} onKeyDown=${w.onKeyDown} placeholder=${w.hint} style=${sx(w.inputStyle)} />`
                    : w.word}</span>`)}
              </div>
              <div style=${sx("display:flex;gap:10px;align-items:center")}>
                <button className="btn btn-primary" onClick=${v.checkBlanks}>Check</button>
                <div style=${sx("font-size:13px;color:color-mix(in srgb, var(--color-text) 60%, transparent)")}>${v.blanksResult}</div>
              </div>
            </div>`}

          ${v.isType && html`
            <div style=${sx("display:flex;flex-direction:column;gap:18px")}>
              ${v.typeUngraded && html`<textarea className="input" value=${v.typed} onChange=${v.onTyped} placeholder="Type the passage from memory. Punctuation and capitals are ignored." style=${sx("min-height:210px;font-size:17px;line-height:1.7")}></textarea>`}
              ${v.typeGraded && html`
                <div style=${sx("display:flex;flex-direction:column;gap:16px")}>
                  <div style=${sx("display:flex;align-items:baseline;gap:12px")}>
                    <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:52px;line-height:1")}>${v.typeScore}</div>
                    <div style=${sx("font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 55%, transparent)")}>words matched</div>
                  </div>
                  <div style=${sx("font-size:19px;line-height:1.8;max-width:74ch;display:flex;flex-wrap:wrap;gap:0 7px")}>
                    ${v.typeDiff.map((d, i) => html`<span key=${i} style=${sx(d.style)}>${d.word}</span>`)}
                  </div>
                </div>`}
              <div style=${sx("display:flex;gap:10px")}>
                <button className="btn btn-primary" onClick=${v.checkTyped}>${v.typeButtonLabel}</button>
              </div>
            </div>`}

          ${v.isScramble && html`
            <div style=${sx("display:flex;flex-direction:column;gap:22px")}>
              <div style=${sx("display:flex;align-items:center;gap:10px;flex-wrap:wrap")}>
                <span style=${sx("font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 55%, transparent)")}>Granularity</span>
                <div style=${sx("display:flex;gap:6px")}>
                  ${v.scrambleLevels.map(lv => html`<button key=${lv.key} onClick=${lv.onClick} style=${sx(lv.style)}>${lv.label}</button>`)}
                </div>
                <span style=${sx("font-size:12px;color:color-mix(in srgb, var(--color-text) 55%, transparent)")}>${v.scrambleLevelDesc}</span>
              </div>
              <div style=${sx("min-height:96px;border:1px dashed var(--color-divider);padding:16px 18px;font-size:19px;line-height:1.65;color:var(--color-text)")}>
                ${v.scrambleEmpty && html`<span style=${sx("font-size:13px;color:color-mix(in srgb, var(--color-text) 45%, transparent)")}>Click the phrases below in the right order.</span>`}
                ${" " + v.scrambleBuilt}
              </div>
              <div style=${sx("display:flex;flex-wrap:wrap;gap:10px")}>
                ${v.scrambleChunks.map((c, i) => html`<button key=${i} onClick=${c.onClick} style=${sx(c.style)}>${c.text}</button>`)}
              </div>
              <div style=${sx("display:flex;gap:10px;align-items:center")}>
                <button className="btn btn-secondary" onClick=${v.resetScramble} style=${sx("font-size:12px;padding:4px 12px")}>Start over</button>
                <div style=${sx("font-size:13px;color:color-mix(in srgb, var(--color-text) 60%, transparent)")}>${v.scrambleResult}</div>
              </div>
            </div>`}

          ${v.showHelp && html`<div style=${sx("border-left:2px solid var(--color-accent);padding:4px 0 4px 16px;font-size:15px;line-height:1.65;color:color-mix(in srgb, var(--color-text) 70%, transparent);max-width:74ch")}>${v.curText}</div>`}

          <div style=${sx("margin-top:auto;display:flex;gap:12px;align-items:center;border-top:1px solid var(--color-divider);padding-top:20px")}>
            <button className="btn btn-primary" onClick=${v.advance}>Done — next passage</button>
            <div style=${sx("margin-left:auto;font-size:12px;color:color-mix(in srgb, var(--color-text) 50%, transparent)")}>${v.curProgressNote}</div>
          </div>
        </div>
      </div>`;
  }

  doneView(v) {
    return html`
      <div style=${sx("max-width:700px;margin:0 auto;padding:90px 36px;display:flex;flex-direction:column;gap:20px;align-items:flex-start")}>
        <div style=${sx("font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--color-accent-700)")}>Session complete</div>
        <h1 style=${sx("margin:0")}>${v.doneHeadline}</h1>
        <p style=${sx("margin:0;font-size:15px;line-height:1.7;color:color-mix(in srgb, var(--color-text) 65%, transparent);max-width:52ch")}>${v.doneBody}</p>
        <div style=${sx("display:flex;gap:10px;margin-top:8px")}>
          <button className="btn btn-primary" onClick=${v.startDue}>Another session</button>
          <button className="btn btn-secondary" onClick=${v.goBoard}>Back to the board</button>
        </div>
      </div>`;
  }

  leaderView(v) {
    return html`
      <div style=${sx("max-width:1080px;margin:0 auto;padding:40px 36px 80px;display:flex;flex-direction:column;gap:26px")}>
        <div style=${sx("display:flex;align-items:flex-end;gap:20px")}>
          <div>
            <h2 style=${sx("margin:0")}>Leaderboard</h2>
            <div style=${sx("font-size:13px;color:color-mix(in srgb, var(--color-text) 55%, transparent)")}>Ranked by passages committed · ${v.groupName}</div>
          </div>
          <div style=${sx("margin-left:auto;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 50%, transparent)")}>${v.daysLeftLabel}</div>
        </div>

        <div style=${sx("display:grid;grid-template-columns:repeat(3,1fr);gap:18px")}>
          ${v.podium.map((p, i) => html`
            <div key=${i} className="blueprint" style=${sx(p.cardStyle)}>
              ${corners()}
              <div style=${sx("font-family:var(--font-heading);font-size:11px;letter-spacing:.16em;opacity:.6")}>${p.place}</div>
              <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:24px;line-height:1.1")}>${p.name}</div>
              <div style=${sx("display:flex;align-items:baseline;gap:8px")}>
                <div style=${sx("font-family:var(--font-heading);font-weight:600;font-size:44px;line-height:1")}>${p.count}</div>
                <div style=${sx("font-size:11px;letter-spacing:.1em;text-transform:uppercase;opacity:.6")}>of ${v.goal}</div>
              </div>
            </div>`)}
        </div>

        <div className="blueprint" style=${sx("padding:0 20px 10px")}>
          ${corners()}
          <table className="table">
            <thead><tr><th style=${sx("width:60px")}>#</th><th>Name</th><th style=${sx("width:120px")}>Committed</th><th style=${sx("width:300px")}>Progress</th><th style=${sx("width:110px")}>Streak</th></tr></thead>
            <tbody>
              ${v.board.map((b, i) => html`
                <tr key=${i} style=${sx(b.rowStyle)}>
                  <td style=${sx("font-family:var(--font-heading);color:color-mix(in srgb, var(--color-text) 45%, transparent)")}>${b.rank}</td>
                  <td style=${sx("font-family:var(--font-heading);font-weight:600;font-size:16px")}>${b.name}</td>
                  <td style=${sx("font-family:var(--font-heading);font-size:17px")}>${b.count}</td>
                  <td><div style=${sx("height:8px;background:var(--color-neutral-200)")}><div style=${sx(b.barStyle)}></div></div></td>
                  <td style=${sx("font-size:13px;color:color-mix(in srgb, var(--color-text) 60%, transparent)")}>${b.streak}</td>
                </tr>`)}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  render() {
    if (!this.state.loaded)
      return html`<div style=${sx("padding:80px 36px;font-family:var(--font-body);color:color-mix(in srgb, var(--color-text) 55%, transparent)")}>Loading the board…</div>`;
    // Require a gpmail.org sign-in before the app. "disabled" (Firebase
    // unreachable) falls through to local-only so members aren't locked out.
    const a = this.state.auth;
    if (a.status !== "signed-in" && a.status !== "disabled") return this.authGate(a);
    const v = this.renderVals();
    return html`
      <div style=${sx("min-height:100vh;background:var(--color-bg);color:var(--color-text);font-family:var(--font-body)")}>
        ${this.header(v)}
        ${v.isBoard && this.boardView(v)}
        ${v.isList && this.listView(v)}
        ${v.isReview && this.reviewView(v)}
        ${v.isDone && this.doneView(v)}
        ${v.isLeader && this.leaderView(v)}
      </div>`;
  }
}
