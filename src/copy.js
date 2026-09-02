/* Every word the app says, in one place.
 *
 * The one stop shop for editing labels. Views and view-models import from here
 * rather than writing text inline, so re-wording a screen is a change to this
 * file and nothing else.
 *
 * Two shapes live here, and the difference is only whether the sentence has a
 * number in it:
 *
 *   - a plain string for text that never changes ("Back to the board");
 *   - a function for text that reads a value the app computed
 *     (`peekCost: (pct) => "Each peek costs " + pct + "%"`).
 *
 * A copy function is a formatter and nothing more: it takes values already
 * worked out by the caller and returns a string. It must not import from srs,
 * progress, or any other model, the numbers are computed where the rule lives
 * and passed in, so this file cannot become a second place the model is
 * described. (The member's commit threshold, profile.reviewSettings, read in
 * viewmodel/explainer.js, stays there; only the sentence around it lives here.)
 *
 * What deliberately is NOT here: the `name`/`short`/`desc` on MODES
 * (review.js), ACTIVITIES (exam.js), and the two difficulty tables (blanks.js).
 * Those sit beside `key` fields that are part of the persisted data model, and
 * splitting a row across two files to save a string would cost more than it
 * saves. STATUS_LABEL is the exception and is defined below, because it is
 * pure wording that four screens quote; progress.js re-exports it.
 *
 * Ordered to mirror src/views/ and src/viewmodel/, one block per screen. */

/* n with a unit that agrees with it: plural(1, "verse", "verses") → "1 verse". */
const plural = (n, one, many) => n + " " + (n === 1 ? one : many);

export const copy = {
  /* ── shared ─────────────────────────────────────────────────────────────── */

  app: {
    wordmark: "VERSE MASTERY",
    /* The epigraph under the wordmark, on the sign-in gate and the board hero. */
    epigraph:
      '"For the word of God is living and active, sharper than any two-edged sword, piercing to the division of ' +
      'soul and of spirit, of joints and of marrow, and discerning the thoughts and intentions of the heart." ' +
      "(Hebrews 4:12)",
    /* Stands in for a member who has not filled in their profile yet. */
    anonymousMember: "Member",
  },

  /* Words that appear on more than one screen and mean the same thing on each. */
  common: {
    all: "All",
    backToBoard: "Back to the board",
    cancel: "Cancel",
    clear: "Clear",
    keepGoing: "Keep going",
    off: "Off",
    on: "On",
    startOver: "Start over",
  },

  /* The words around choosing a category. The category *names* are not here,
   * they sit beside their keys in categories.js, for the same reason MODES and
   * ACTIVITIES keep theirs, so this is only the wording that frames the
   * choice, shared by the passage list and all three setup screens. */
  category: {
    label: "Which passages",
    /* Said under the picker on a setup screen, because narrowing the shelf
     * narrows what the sitting can possibly offer. */
    note: "Narrows this sitting to one part of the set.",
    emptyFor: (name) => "Nothing in " + name + " matches these settings.",
  },

  /* The member-facing name of each status. Quoted by the board, the list's
   * filter tabs and row pills, and the queue previews, so it is said once. */
  status: {
    memorized: "Committed",
    learning: "In progress",
    new: "Not started",
  },

  /* The member-facing word for each stored gender value. GENDERS in profile.js
   * ("Male"/"Female") stays the persisted key, it is what is written to a
   * profile and what the filters match against, this is only what gets said
   * on screen: the profile form's buttons, the leaderboard's gender filter, and
   * the group name when the standings are ranked by gender. */
  gender: {
    Male: "Brother",
    Female: "Sister",
  },

  /* ── chrome ─────────────────────────────────────────────────────────────── */

  nav: {
    board: "Home",
    list: "Passages",
    leaderboard: "Stats",
    guide: "Guide",
  },

  header: {
    learn: "LEARN",
    review: "REVIEW",
    test: "TEST",
    settings: "Settings",
    signOut: "Sign out",
    /* Shown in place of a name until the profile is filled in. */
    setUpProfile: "Set up your profile",
  },

  footer: {
    url: "https://forms.gle/H3YGDEJ4XXtN4Aoz5",
    prompt: "🐛 Spotted bugs or got a feature request?",
    link: "Fill out this form.",
    /* Crossway's required notice, which has to appear where the text does and
     * not only in the repo's README. The footer is under every signed-in
     * screen, so this is the one place in the app that shows scripture without
     * also being a card the member is working. */
    esv:
      "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), " +
      "© 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.",
  },

  /* ── the gates ──────────────────────────────────────────────────────────── */

  /* The first of them, and the only one a member can do nothing about: the app
   * is not offered on a phone or a tablet (see src/device.js). It stands in
   * front of the splash, so it is written first here too. */
  mobileGate: {
    message:
      "This app is not available on a mobile device to reduce screen time. Access with a non-mobile device instead.",
  },

  /* The splash the app opens on, while it works out whether the member is
   * already signed in.
   *
   * `steps` are the three lines the registration mark cycles through, they
   * name the boot rather than measure it, since none of the three has a figure
   * the member could act on. `note` is the one truthful line underneath, read
   * aloud but not drawn: the cycle is on a CSS timer, so announcing it would
   * report a state the app is not actually in. */
  splash: {
    steps: {
      indexing: (count) => "Indexing " + count + " passages",
      restoring: "Restoring your progress",
      queueing: "Building today's queue",
    },
    note: "Checking your session…",
  },

  authGate: {
    prompt: "account to track your passages and sync across devices.",
    promptLead: "Sign in with your",
    denied: (domain) =>
      "That account isn't an Acts 2 Network account. Please sign in with your " + domain + " account.",
    failed: "Sign-in didn't complete. Please try again.",
    busy: "Signing in…",
    signIn: "Sign in with Google",
  },

  /* The gate between signing in and the app, for the moment the member's saved
   * record is being fetched, and for when it cannot be. It is a gate rather
   * than a banner because the screen it stands in front of is the sign-up form,
   * and showing that to a member who already has a record is what makes them
   * fill it in again and overwrite the record they had. */
  syncGate: {
    titlePulling: "FINDING YOUR RECORD",
    pulling: "Checking your account for passages you have already committed…",
    titleError: "COULD NOT REACH YOUR RECORD",
    /* Deliberately does not say "you have no progress", the whole point is
     * that the app does not know yet. */
    error:
      "You are signed in, but your saved passages could not be loaded. Starting now would set up a new record and " +
      "could overwrite the one you already have, so the app is waiting instead.",
    /* A refused read means the account is fine and the server said no, which is
     * a Firestore rules problem rather than anything the member did wrong. */
    denied: "Your account does not have permission to read its own record. This is a setup problem, not your account.",
    offline: "Your device could not reach the server. Check your connection and try again.",
    /* The SDK itself never arrived, so there was no sign-in and no read. Worth
     * its own sentence because the usual suspects are local and fixable. */
    titleUnreachable: "COULD NOT REACH YOUR ACCOUNT",
    unreachable:
      "The app could not load the service that signs you in, so it cannot tell what you have already committed. " +
      "Starting now would set up a new record on this device alone.",
    unreachableDetail:
      "This is usually a network blocking www.gstatic.com, an ad blocker, or a browser extension. " +
      "Try again, or open the app on another network.",
    retry: "Try again",
    retrying: "Trying…",
    signOut: "Sign out",
  },

  /* The same trouble, once the member has a usable profile on this device: the
   * app works, but nothing they do is leaving the device, and they should know
   * that before they spend a sitting on it. */
  syncBanner: {
    message: "Not syncing, your work is being saved on this device only.",
    retry: "Retry sync",
  },

  profileForm: {
    titleSetup: "SET UP YOUR PROFILE",
    titleEdit: "EDIT YOUR PROFILE",
    /* What the same screen is called when the identity fields are not on it,
     * with the profile put away (config.js features.profileSetup) there is no
     * profile to edit, only the settings that were sitting underneath it. */
    titleSettings: "SETTINGS",
    submitSetup: "Save and continue",
    submitEdit: "Save changes",
    name: "Name",
    namePlaceholder: "Your full name",
    ministryGroup: "Ministry group",
    ministryPlaceholder: "Start typing to search…",
    gender: "Gender",
    gradClass: "Graduating class",
    gradClassPlaceholder: "e.g. 2016",
    /* Shown on the setup form in place of the review settings, which are not
     * asked for until the member has something to judge them against. */
    settingsLater: "You can change how reviews work later, under Settings.",
    /* The switch that takes a member off the leaderboard, and the one sentence
     * under it. It says the thing a member turning it off would otherwise
     * wonder, that their group is not made to look worse for it, and nothing
     * else: what the switch does is legible from the switch. */
    sharing: "LEADERBOARD",
    shareRanking: "Share my ranking",
    shareRankingNote: "Your ministry and group average still includes you, without saying who you are.",
    reviewSettings: "REVIEW SETTINGS",
    dueFreshness: "Review a committed verse once it fades to (%)",
    commitThreshold: "Count a verse committed once a write-out gets (%) of the words right",
    difficulty: "Default difficulty",
    difficultyLevels: ["Easy", "Medium", "Hard"],

    /* Which way round the page is printed. Its own block rather than another
     * review setting, because it is not one: it is about the screen the member
     * is reading on, which is why the note says "this device", the settings
     * above travel with the profile and this one cannot. */
    appearance: "APPEARANCE",
    theme: "Theme",
    themeLabels: { light: "Light", dark: "Dark", system: "System" },

    /* Wiping the record. The button is the smaller half of this: what stands
     * beside it has to say plainly what goes, what stays, and that it reaches
     * the member's other devices, nothing here is recoverable afterwards. */
    reset: {
      section: "RESET",
      note: "Clear everything you have memorized and start the set from the beginning. Your profile and the settings above are kept.",
      standing: (committed, inProgress) =>
        "You have " +
        plural(committed, "passage", "passages") +
        " committed and " +
        plural(inProgress, "passage", "passages") +
        " in progress.",
      standingEmpty: "You have not recorded anything yet, so there is nothing to reset.",
      button: "Reset all progress",

      title: "Reset all progress?",
      warning: (committed, inProgress, streak) =>
        "This erases " +
        plural(committed, "committed passage", "committed passages") +
        " and " +
        plural(inProgress, "passage", "passages") +
        " in progress" +
        (streak > 0 ? ", along with your streak of " + plural(streak, "day", "days") : "") +
        ". Every passage goes back to Not started, and all freshness and review history is lost.",
      sync: "It clears your progress in the cloud too, so it will be gone on every device you sign in on.",
      keeps: "Your profile and the review settings above are kept. This cannot be undone.",
      confirm: "Yes, reset everything",
      cancel: "Keep my progress",
    },
  },

  welcome: {
    title: "You're all set",
    lead:
      "Before you dive in, the guide is worth two minutes, it walks through how committing a verse, freshness, " +
      "and the three ways through the set all work.",
    guideCta: "Check out the guide",
    learnCta: "Start learning right away",
  },

  /* ── the board ──────────────────────────────────────────────────────────── */

  board: {
    progressTo: (dateLabel) => "Progress to " + dateLabel,
    goalUnit: "passages committed",
    inProgress: (n) => n + " in progress",
    notStarted: (n) => n + " not started",
    ofGoal: (pctLabel) => pctLabel + " of the goal",

    statDaysLeft: "Days left",
    statDaysLeftNote: (dateLabel) => "until " + dateLabel,
    statPace: "Pace needed",
    statPaceNote: "passages a week",
    statReviewed: "Reviewed today",
    statReviewedNote: "cards handled",
    statStreak: "Streak",
    statStreakNote: "days running",

    reviewTitle: "Review today",
    learnTitle: "Learn today",
    queueCount: (n) => plural(n, "passage", "passages"),
    reviewQueueNote: (dueFreshness) => "committed · faded to " + dueFreshness + "% or below",
    reviewQueueEmpty: "Nothing to review. Every verse you have committed is still fresh.",
    reviewQueueEmptyNoneCommitted: "Nothing to review yet, a verse arrives here once you have committed it.",
    learnQueueNote: "not committed · give one back in full to commit it",
    learnQueueEmpty: "Every passage in the set is committed. Nothing left to learn.",
    /* A verse in the learn queue has no freshness worth quoting yet. */
    freshNew: "new",

    mapTitle: "The whole set",
    mapNote: "one cell per passage, in canonical order",
    legendCommitted: "committed",
    legendLearning: "in progress",
    legendNew: "not started",
    /* Hover text on one cell: the passage, its status, and its freshness if it
     * has been reviewed at all. */
    mapCellTitle: (ref, statusLabel, fresh) =>
      ref + ", " + statusLabel + (fresh == null ? "" : " · " + fresh + "% fresh"),

    activityTitle: (days) => "Last " + days + " days",
    activityAxis: "reviews per day",
    activityToday: "today",
    dayBarTitle: (dateLabel, n) => dateLabel + ": " + n,

    paceTitle: "Pace check",
    paceHeadlineDone: "All of them. Well done.",
    paceHeadline: (perWeek) => perWeek + " a week from here",
    paceBodyDone: "Every passage is committed. Keep reviewing so they stay that way.",
    paceBody: (left, daysLeft, perWeek) =>
      "You have " +
      left +
      " passages left and " +
      daysLeft +
      " days. That is about " +
      perWeek +
      " newly committed each week, plus review of what you already hold.",
    paceLearn: "Learn a passage",
    paceReview: "Review",
    paceTest: "Take a test",
    paceBrowse: (total) => "Browse all " + total,
    paceGuide: "How this works",
  },

  /* ── the passage list ───────────────────────────────────────────────────── */

  list: {
    title: "All passages",
    summary: (shown, committed, untouched) =>
      shown + " shown · " + committed + " committed · " + untouched + " untouched",
    searchPlaceholder: "Search reference or text",

    colNum: "No.",
    colRef: "Reference",
    colSnippet: "Opening words",
    colFreshness: "Freshness",
    colStatus: "Status",
    colAction: "Action",
    fading: "Fading",
    /* A passage never reviewed has no freshness to show. */
    freshNone: "–",
    /* The heading above a run of sections cut from one long chapter. */
    groupHeading: (group) => group,

    selectionLabel: (count, hidden) =>
      plural(count, "verse selected", "verses selected") + (hidden ? " · " + hidden + " not shown" : ""),
    /* Said only when the ticks straddle both halves of the set, since that is
     * the only time the two buttons need explaining. */
    selectionNote: "Committed verses are reviewed and the rest are learned, so this is two sittings. Your ticks keep.",
    /* How a run of rows is ticked at once. Said beside the ticks rather than in
     * the guide, because it is worth nothing until there is a first tick. */
    selectionRange: "Shift-click another row to tick everything in between.",
    selectionReview: "Review",
    selectionLearn: "Learn",
    selectionSitting: (label, n) => label + " " + n,
    selectAllOn: "Clear the rows shown",
    selectAllOff: "Select the rows shown",
    selectRow: (selected, ref) => (selected ? "Deselect " : "Select ") + ref,

    actionReview: "Review",
    actionLearn: "Learn",
  },

  /* ── the explainer both setup screens carry ─────────────────────────────── */

  explainer: {
    show: "Show",
    hide: "Hide",

    freshnessTitle: "How it works",
    freshnessBody: (dueFreshness) =>
      "Every passage carries a freshness, how much of it you would still recall right now. It falls a little " +
      "every day along a forgetting curve, fast at first and then more slowly the better you know it. Once a " +
      "committed passage has faded to " +
      dueFreshness +
      "% it comes back round to you, most faded first. (That mark is yours to set, on your profile.)",
    /* The flashcard is the one activity with nothing to grade. */
    ruleUnmarked: "Unmarked, nothing to grade, so it counts as reviewed in full, but builds the least lasting memory.",
    ruleCeiling: (ceiling) => "Up to " + ceiling + "%, on a clean attempt.",
    noteSubmitting: "Submitting is what marks a passage: what you get right is what it earns.",
    noteDifficulty:
      "Harder settings pay more, the finest cut of phrases and the fullest set of blanks are worth the most.",
    notePeek: (cost) => "Each press of Peek costs " + cost + "%, so a passage you look up stays due sooner.",

    commitTitle: "How it works",
    commitBody: (bar) =>
      "A passage is committed when you give the whole thing back from memory, recited aloud or typed, " +
      bar +
      "% of the words right and without peeking; the first-letter scaffold is still allowed here. " +
      "Take as many attempts as you like; only the one you get right counts, and none of them cost you anything.",
  },

  /* ── review setup ───────────────────────────────────────────────────────── */

  reviewSetup: {
    kicker: "Review",
    title: "Configure your review",
    target: "Target verses",
    size: "How many committed verses",
    freshness: "Freshness ceiling",
    freshnessDescAny: "Any committed verse.",
    freshnessDesc: (pct) => "Only committed verses faded to " + pct + "% or below.",
    start: "Start Review",
    goLearn: "Learn instead",

    targetDue: (dueFreshness) => "Reviewing the committed verses that have faded to " + dueFreshness + "% or below.",
    targetCaughtUp:
      "You're all caught up, nothing you have committed has faded that far. Set up some extra review below.",
    targetNothingCommitted:
      "You have not committed a verse yet, so there is nothing to review. Start with a learn session instead.",
    noteDue: (n) => plural(n, "verse is due right now.", "verses are due right now."),
    noteManual: (n) => plural(n, "committed verse matches these settings.", "committed verses match these settings."),
    noteNone: "No committed verses match these settings.",
  },

  /* ── learn setup ────────────────────────────────────────────────────────── */

  learnSetup: {
    kicker: "Learn",
    title: "Commit a passage to memory",
    size: "How many verses",
    sizeNote: "Verses you have already started come first, then the ones you have not opened yet.",
    previewTitle: "What you will work on",
    previewStarted: "In progress",
    previewNotStarted: "Not started",
    previewMore: (n) => "+" + n + " more",
    start: "Start learning",
    goReview: "Review instead",

    note: (sitting, pool, started) =>
      plural(sitting, "verse in this sitting", "verses in this sitting") +
      " · " +
      pool +
      " uncommitted in the set" +
      (started ? ", " + started + " already in progress" : ""),
    noteEmpty: "Every passage in the set is committed. There is nothing left to learn.",
  },

  /* ── the review / learn session ─────────────────────────────────────────── */

  review: {
    leave: "Leave session",
    sessionLearn: "Learn",
    sessionReview: "Review",
    position: (i, n) => "Passage " + i + " of " + n,
    meta: (testament, words) => (testament === "OT" ? "Old Testament" : "New Testament") + " · " + words + " words",
    peek: "Peek",

    /* flashcard */
    flipFront: "Reference",
    flipHint: "Say it aloud from memory, then turn the card to check yourself.",
    flipShow: "Show passage",
    flipHide: "Hide passage",
    flipLettersShow: "Show first letters",
    flipLettersHide: "Hide first letters",
    flipCardToBack: "Turn the card over to show the passage",
    flipCardToLetters: "Turn the card over to show the first letters",
    flipCardToFront: "Turn the card back to the reference",

    /* fill the blanks */
    blanksLabel: "Blanks",
    blanksFirstLetter: "First letter",
    blanksLevelDesc: (desc) => "Blanking " + desc,
    /* Shown only at the alternating level, where there are two halves of the
     * passage and the member picks which one goes. The button labels count the
     * words off rather than saying "odd" and "even", see BLANK_PARITIES. */
    blanksParityLabel: "Take away",
    blanksResult: (right, total) => right + " of " + total + " right",
    blanksCount: (total) => total + " blanks",

    /* from memory, typed, or recited aloud */
    typeFirstLetterLabel: "First letters only",
    typeFirstLetterNote:
      "Type just the first letter of each word instead of the whole passage. " +
      "A wrong letter shows you the word and moves on, you cannot go back and change it.",
    typePlaceholder: "Type the passage from memory, or recite it aloud. Punctuation and capitals are ignored.",
    typeFirstLetterPlaceholder:
      "Type just the first letter of each word, e.g. “f t h w”. Spacing and punctuation are ignored, " +
      "and there is no backspace: type each letter once.",
    typeRevealed: "words revealed",
    typeMatched: "words matched",

    /* reciting aloud, one toggle beside the scaffold's, and the only two
     * things worth saying: that this browser cannot listen, and why it stopped
     * if it did. The words themselves land in the box, which needs no label. */
    voiceLabel: "Voice",
    voiceNote: "Say the passage, the words appear as you go.",
    voiceUnsupported: "Not available in this browser.",
    voiceErrors: {
      "not-allowed": "The microphone was blocked. Allow it in your browser, then try again.",
      "no-microphone": "No microphone was found.",
      network: "The voice service could not be reached.",
      failed: "Something went wrong listening. Try again.",
    },

    /* order the phrases */
    scrambleLabel: "Granularity",
    scrambleLevelDesc: (desc) => "Cutting into " + desc,
    scrambleEmptyHint: "Click the phrases below in the right order.",
    scrambleDone: "Complete, in order.",
    scrambleProgress: (placed, total) => placed + " of " + total + " placed",
    scrambleMisses: (n) => plural(n, "wrong try", "wrong tries"),

    /* what the card is playing for, a learn session's voice */
    commitDoneTag: "Committed",
    commitTodoTag: "To commit",
    commitDoneNote: "Committed. You have given this one back in full from memory.",
    commitWritingNote: (bar) => "Get " + bar + "% of the words right, without peeking, and this verse is committed.",
    commitOtherNote: "Head over to the Recall tab to commit it into your memory bank.",
    peekCostsCommit: "A peek means this attempt cannot commit the verse.",
    peekSpentCommit: "Peeked, this attempt can no longer commit the verse.",

    /* and a review session's */
    peekCost: (cost) => "Each peek costs " + cost + "%",
    peekSpent: (n, cost) => plural(n, "peek · −", "peeks · −") + cost + "%",

    /* handing the card in */
    submit: "Submit",
    submitted: "Submitted",
    previous: "Previous",
    next: "Next passage",
    finish: "Finish session",

    resultSubmitted: (modeName) => modeName + " · submitted",
    resultScore: (pct) => pct + "% right",
    resultReviewed: "Reviewed",
    resultWas: "Was",
    resultNow: "Now",
    resultDecays: "Freshness decays from here.",
    resultDecaysAfterPeeks: (n) => "After " + plural(n, "peek.", "peeks.") + " Freshness decays from here.",

    learnCommitted: "Committed",
    learnStillCommitted: "Still committed",
    learnNotYet: "Not committed yet",
    learnCommittedNote: "You gave the passage back in full from memory. It moves to your review list from here.",
    learnStillCommittedNote: "You already have this one. Keep it in your review list.",
    learnWriteOutNote: (bar) =>
      "Giving the whole passage back from memory is what commits it, " + bar + "% of the words, unaided.",
    learnPracticeNote: "Practice recorded. Giving the passage back in full is what commits it.",
    tryAgain: "Try again",

    /* leaving, and walking off an unsubmitted card */
    leaveTitle: "Leave the session?",
    leaveConfirm: "Leave the session",
    leaveNothing: "Nothing has been submitted yet, so no passage will change.",
    leaveLearn: (committed) =>
      plural(committed, "passage stays committed", "passages stay committed") +
      " and everything you have submitted is kept. The rest of the queue is dropped.",
    leaveReview: (submitted) =>
      plural(submitted, "passage you have submitted keeps", "passages you have submitted keep") +
      " the freshness it earned. The rest of the queue is dropped.",
    moveBackTitle: "Go back without submitting?",
    moveOnTitle: "Move on without submitting?",
    moveBack: "Go back",
    moveOn: "Move on",
    moveStay: "Stay on this passage",
    moveNoteReview:
      "This passage has not been handed in, so it earns no freshness, its place in your queue does not change, " +
      "and what you have filled in here is lost.",
    moveNoteLearn:
      "This passage has not been handed in, so nothing about it is recorded, its place in your queue does not " +
      "change, and what you have filled in here is lost.",
  },

  /* ── end of a session ───────────────────────────────────────────────────── */

  done: {
    kicker: "Session complete",
    headlineLearn: (n) => plural(n, "passage committed", "passages committed"),
    headlineReview: (n) => plural(n, "passage refreshed", "passages refreshed"),
    leadCommitted: "Written out in full from memory, that is what commits a passage. ",
    leadNothingCommitted:
      "Nothing was committed this time. A passage is committed by writing it out in full, so keep at these until " +
      "you can. ",
    leadReviewed: "Every passage you reviewed is fresh again. ",
    tally: (committed, goal, daysLeft) =>
      committed + " of " + goal + " are committed, with " + daysLeft + " days to go.",
    againLearn: "Learn more",
    againReview: "Review more",
    otherReview: "Review instead",
    otherLearn: "Learn instead",
  },

  /* ── test mode ──────────────────────────────────────────────────────────── */

  exam: {
    /* setup */
    setupKicker: "Test mode",
    setupTitle: "Set the test",
    setupSize: "How many verses",
    setupCommitted: "Committed verses only",
    setupFreshness: "Freshness ceiling",
    setupFreshnessDescAny: "Every verse, however fresh.",
    setupFreshnessDesc: (pct) => "Only verses that have faded to " + pct + "% or below.",
    setupActivities: "Activities",
    setupStart: "Start the test",
    setupPoolNote: (chosen, pool, questions) =>
      plural(chosen, "verse", "verses") +
      " under test, out of " +
      pool +
      " that match, " +
      plural(questions, "question", "questions") +
      ".",
    setupPoolEmpty: "No verses match these settings yet. Widen the freshness ceiling, or let uncommitted verses in.",
    setupPoolEmptyUncommitted:
      "No verses are committed yet, so “Committed verses only” has nothing to test. Turn it off, or commit a verse first.",

    /* the running paper */
    leave: "Leave the test",
    position: (i, n) => "Question " + i + " of " + n,
    next: "Next question",
    finish: "Finish and mark",
    back: "Back",
    leaveTitle: "Leave the test?",
    leaveBody:
      "Nothing you have answered will be marked, and no verse's freshness will change. Any progress in this test " +
      "will not be saved.",

    whereFrom: "Where is it from?",
    refPlaceholder: "Book and chapter, verse optional",
    finishHint: "Finish the sentence from memory. Punctuation and capitals are ignored.",
    refHint: "Book and chapter, worth a quarter of the mark.",
    typeAsk: "Write out this passage",
    typePlaceholder: "Type the passage from memory. Punctuation and capitals are ignored.",
    matchNote: "Click a verse, then its reference. Click a paired verse to undo it.",
    matchPickRef: "Now choose the reference it belongs to.",
    matchNowPick: "Now pick its reference →",
    matchUnpaired: "Unpaired",
    scrambleEmptyHint: "Click the phrases below in the right order.",

    /* the summary */
    doneKicker: "Test complete",
    doneScoreNote: (right, total) => right + " of " + plural(total, "question", "questions") + " right",
    doneHeadlineHigh: "Held, all of it.",
    doneHeadlineMid: "Mostly held.",
    doneHeadlineLow: "Worth another week on these.",
    doneBody:
      "Each verse's freshness now reflects how it went, the ones that slipped have been dated back, and will come " +
      "round again sooner.",
    doneAgain: "Another test",
    doneVersesTitle: "Where each verse landed",
    doneVersesNote: "freshness before and after",
    donePaperTitle: "The paper",
    doneYou: "You ",
    doneAnswer: "Answer ",
    driftFresher: "fresher",
    driftHeld: "held",
    driftFaded: "faded",

    givenNothingChosen: "Nothing chosen",
    givenBlank: "Left blank",
    givenPairs: (hits, total) => plural(hits, "pair", "pairs") + " right of " + total,
    givenParts: (hits, total) => plural(hits, "part", "parts") + " right of " + total,
    givenFinish: (text, ref) => (text || "nothing written") + ", " + (ref || "no reference"),
    expectedFinish: (answer, ref) => answer + ", " + ref,
    expectedNoneOfTheAbove: (ref) => "None of the above, it is " + ref,
    versesUnderTest: (n) => plural(n, "verse", "verses"),
  },

  /* ── the leaderboard ────────────────────────────────────────────────────── */

  leaderboard: {
    title: "Leaderboard",
    blurb: "Ranked by freshness score, committed verses weighted by how well they are retained right now.",
    daysLeft: (n) => n + " days remaining",
    filterGroup: "Ministry group",
    filterGender: "Gender",
    filterClass: "Class",
    filterEveryone: "Everyone",
    filterClassOf: (year) => "Class of " + year,
    count: (n) => plural(n, "person", "people"),
    empty: "No one matches these filters yet.",
    /* The one line above the board about the member's own place on it. Said
     * either way round, and kept to a sentence: the default is to be on the
     * board, so the thing worth saying is that leaving it is a choice they
     * have. Settings is behind a gear, which is not somewhere a member finds
     * by looking, so it is named. */
    shownNote: "Your ranking is visible to the group. You can hide it in Settings.",
    hiddenNote: "You are hidden from this board. Only you can see your row. Turn it back on in Settings.",
    places: ["First", "Second", "Third"],
    you: "You",
    podiumOf: (total) => "of " + total,
    podiumAvg: "avg freshness",
    streakDays: (n) => n + " days",
    colRank: "#",
    colName: "Name",
    colCommitted: "Committed",
    colAvgFresh: "Avg fresh",
    colFreshness: "Freshness",
    colStreak: "Streak",

    /* Ranking groups rather than people. The measure is per member throughout,
     * see src/standings.js for why a total would rank by attendance, so the
     * wording says "each" wherever a figure could be mistaken for a total. */
    rankByLabel: "Rank",
    rankBy: {
      group: "Ministry",
      gradClass: "Class",
      gender: "Bros & Sis",
      people: "Individuals",
    },
    groupBlurb: "Groups ranked by how much each member holds, so a small group is not out-run by a large one.",
    colGroupMembers: "Members",
    colGroupAvgCommitted: "Committed each",
    groupMembers: (n) => plural(n, "member", "members"),
    /* The tally above the table counts whatever the table holds. "2 people" over
     * a list of ministries would be counting the wrong thing. */
    countGroups: (n) => plural(n, "group", "groups"),
    groupEmpty: "No one has filled this in yet.",
    podiumEach: "committed each",
    yourGroup: "Yours",
  },

  /* ── the guide ──────────────────────────────────────────────────────────── */

  /* Written at about a middle-school reading level on purpose: short sentences,
   * plain words, one idea at a time. This is the screen a member reads when they
   * do not yet know how any of this works, so it does not get to use the voice
   * the rest of the app does, keep it plain when editing.
   *
   * Two words are the exception: "committed" and "freshness" are printed on
   * every other screen, so the guide teaches them rather than inventing easier
   * synonyms that would then match nothing the member sees elsewhere. */
  guide: {
    kicker: "The guide",
    title: "How this app works",
    lead:
      "Two ideas run this whole app. First: a verse only counts as committed when you can say or write the whole " +
      "thing from memory. Second: after you learn a verse, you slowly start to forget it. " +
      "The app keeps track of how much you still remember, it calls that freshness, and asks for the verse back " +
      "before you lose it.",

    commitTitle: "Committing a verse to memory",
    commitBody: (bar) =>
      "A verse becomes committed when you give the whole thing back from memory. Say it out loud, or type it, " +
      "either one counts, and the first-letter hints can stay on. You need " +
      bar +
      "% of the words right, and no peeking. " +
      "Try as many times as you want. Only the try you get right counts, and the ones you miss cost you nothing.",
    commitFrom: "Learn",
    commitFromNote: "not committed yet",
    commitTo: "Review",
    commitToNote: "committed, now you keep it fresh",
    commitStamp: "gave it back from memory",
    commitFoot:
      "Nothing sends a verse back the other way. Mistakes can cost you freshness, but you won't lose a verse you " +
      "have already committed.",

    freshTitle: "Freshness, and why reviewing helps",
    freshNote: "drag the slider",
    freshBody: (dueFreshness) =>
      "Every committed verse has a freshness score. It is how much of the verse you would still remember right " +
      "now. It drops a little every day, quickly at first, then slower once you know the verse well. When it " +
      "drops to " +
      dueFreshness +
      "%, the app puts the verse back on your list. Drag the slider to visualize how freshness decays.",
    daysPrompt: "Days since you last reviewed it",
    dayLabel: (d) => (d === 0 ? "the same day" : d === 1 ? "1 day later" : d + " days later"),
    axisToday: "today",
    axisDay: (d) => d + "d",
    curveHeld: "A verse you have reviewed a few times",
    curveFresh: "A verse you just learned",
    markLabel: (dueFreshness) => "asks for it back at " + dueFreshness + "%",
    curveAria: (dayLabel, held, fresh) =>
      "Two forgetting curves over a month. " +
      dayLabel +
      ", a verse you have reviewed a few times is " +
      held +
      "% fresh, and one you just learned is " +
      fresh +
      "% fresh.",
    freshVerdictAbove: "Still above the line, so the app leaves this verse alone.",
    freshVerdictBelow: "Below the line, so this verse goes back on your review list.",
    freshFoot: (holdsFor) =>
      "Both verses were reviewed on the same day. The one you have practiced a few times stays off your list for " +
      "about " +
      holdsFor +
      " days. The one you just learned is back tomorrow. Every review you get right stretches that gap out " +
      "further, by one step, in the order below.",

    ladderTitle: "How often you will see a verse",
    ladderNote: "the schedule",
    ladderBody: (first, second) =>
      "Every verse you are working on has a place on this ladder. You start at the bottom, so the app asks for " +
      "the verse back " +
      (first === 1 ? "the next day" : first + " days later") +
      ". Get it right and you move up one step, so the next gap is " +
      second +
      " days, then three, then four, and on up to a week, a month, a year. Miss it and you slide back down. The " +
      "steps are small at the bottom on purpose: that is when you forget the fastest.",
    /* A rung of the ladder, in the plainest words for that many days. */
    rungLabel: (days) => {
      if (days < 7) return days === 1 ? "1 day" : days + " days";
      if (days < 30) return days === 7 ? "1 week" : days / 7 + " weeks";
      if (days < 365) return days === 30 ? "1 month" : Math.round(days / 30) + " months";
      return "1 year";
    },
    rungsAria: (count, last) =>
      "The review schedule, " + count + " steps from 1 day at the bottom up to " + last + " at the top.",
    ruleAdvanceWhen: (pct) => "You get " + pct + "% or more right",
    ruleAdvanceThen: "Up a step. Longer gap before you see it again.",
    ruleHoldWhen: (from, to) => "You get " + from + "–" + to + "% right",
    ruleHoldThen: "Stay put. You get the same gap over again.",
    ruleBackWhen: (from, to) => "You get " + from + "–" + to + "% right",
    ruleBackThen: "Down a step. The verse comes back sooner.",
    ruleResetWhen: (pct) => "You get under " + pct + "% right",
    ruleResetThen: "Back to the bottom, and the ladder starts again.",
    ladderFoot: (peek) =>
      "Two things never move you up. Flashcards do not count, because turning a card over shows you the verse, " +
      "it cannot prove you knew it, so a flashcard leaves you on the step you are on. And each peek costs you " +
      peek +
      "%, which is often enough to keep you there too.",

    activityTitle: "Four ways to practise a verse",
    activityNote: "you get the same four in Learn, Review and Test",
    activityUnmarked: "Not graded. It counts as a full review, but it helps your memory the least.",
    activityPays: (ceiling) => "Worth up to " + ceiling + "% freshness if you get it all right on the hardest setting.",
    commitsFlag: "the only one that commits",

    /* The sample passage the four demonstrations are drawn from. Short, and one
     * most members will recognise, so the drawing reads as a verse rather than
     * as lorem ipsum. */
    sample: {
      ref: "Deuteronomy 6:4",
      lead: "Hear, O Israel: The LORD our God, the LORD is",
      blank: "one",
      phrases: ["Hear, O Israel:", "The LORD our God,", "the LORD is one."],
    },
    start: "Start learning",
  },
};
