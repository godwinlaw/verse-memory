/* The category picker, built once for the four screens that offer it.
 *
 * The passage list, the two setup screens and the test setup all ask the same
 * question, which shelf of the set are we talking about, and all four answer
 * it the same way: "All", then one option per category, in the order
 * categories.js lists them. Only the styling differs (the list dresses it as
 * filter tabs beside the status tabs, the setup screens as a segmented
 * control), so that is what the caller passes in.
 *
 * `selected` is null for "All". Keeping null rather than a "all" key is what
 * lets categories.inCategory() take the value straight through without the
 * callers each translating a sentinel. */

import { copy } from "../copy.js";
import { CATEGORIES } from "../categories.js";

export function categoryOptions({ selected, onPick, style }) {
  const opts = [{ key: "all", label: copy.common.all, value: null }].concat(
    CATEGORIES.map((c) => ({ key: c.key, label: c.short, title: c.name, value: c.key })),
  );
  return opts.map((o) => ({
    key: o.key,
    label: o.label,
    // The full name where there is room for it, since "Core verses" and "DT"
    // are abbreviations of titles a member has not necessarily read yet.
    title: o.title || o.label,
    onClick: () => onPick(o.value),
    style: style(selected === o.value || (!selected && o.value === null)),
  }));
}
