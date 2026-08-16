/* View-models for the two full-screen gates that stand in front of the app:
 * the Google sign-in prompt and the member profile form. */

import { GENDERS, MINISTRY_GROUPS, isProfileComplete } from "../profile.js";
import { PRIMARY_DOMAIN } from "../firebase.js";

export function authGateVals({ auth, groupName, motto, actions }) {
  return {
    groupName,
    motto,
    busy: auth.status === "loading" || auth.status === "signing-in",
    denied: auth.status === "denied",
    failed: auth.status === "signed-out" && auth.error === "sign-in-failed",
    // Every domain in ALLOWED_DOMAINS can sign in; the prompt names one so the
    // instruction stays short.
    domainLabel: "@" + PRIMARY_DOMAIN,
    onSignIn: actions.signIn,
  };
}

const ministryOptionStyle = (selected) =>
  "display:block;width:100%;text-align:left;padding:8px 12px;border:none;border-bottom:1px solid var(--color-divider);" +
  "cursor:pointer;font-family:var(--font-body);font-size:14px;color:var(--color-text);background:" +
  (selected ? "var(--color-accent-100)" : "transparent");

const genderButtonStyle = (selected) =>
  "flex:1;padding:9px 12px;font-family:var(--font-heading);font-weight:600;letter-spacing:.04em;cursor:pointer;" +
  "border:1px solid var(--color-divider);background:" +
  (selected ? "var(--color-accent)" : "transparent") +
  ";color:" +
  (selected ? "var(--color-bg)" : "var(--color-text)");

export function profileFormVals({ state, groupName, isSetup, actions }) {
  const draft = state.profileDraft || state.profile || {};
  // Pre-fill the name from the Google account until the member edits it, so
  // there is usually nothing to type.
  const googleName = (state.auth.user && state.auth.user.name) || "";
  const name = draft.name != null ? draft.name : googleName;
  const query = (draft.ministryGroup || "").trim().toLowerCase();

  return {
    isSetup,
    groupName,
    title: isSetup ? "SET UP YOUR PROFILE" : "EDIT YOUR PROFILE",
    submitLabel: isSetup ? "Save and continue" : "Save changes",
    complete: isProfileComplete({ ...draft, name }),

    name,
    onName: (e) => actions.setProfileField("name", e.target.value),

    ministryGroup: draft.ministryGroup || "",
    ministryOpen: state.ministryOpen,
    onMinistryInput: (e) => {
      actions.setProfileField("ministryGroup", e.target.value);
      actions.setMinistryOpen(true);
    },
    onMinistryFocus: () => actions.setMinistryOpen(true),
    onMinistryBlur: () => actions.closeMinistryList(),
    ministryMatches: MINISTRY_GROUPS.filter((g) => g.toLowerCase().includes(query)).map((g) => ({
      label: g,
      style: ministryOptionStyle(draft.ministryGroup === g),
      // mousedown, not click: the input's blur would close the list first.
      onSelect: (e) => {
        e.preventDefault();
        actions.setMinistryOpen(false);
        actions.setProfileField("ministryGroup", g);
      },
    })),

    genders: GENDERS.map((g) => ({
      label: g,
      style: genderButtonStyle(draft.gender === g),
      onClick: () => actions.setProfileField("gender", g),
    })),

    gradClass: draft.gradClass == null ? "" : draft.gradClass,
    onGradClass: (e) => actions.setProfileField("gradClass", e.target.value),

    dueTopX: draft.dueTopX !== undefined ? draft.dueTopX : 10,
    onDueTopX: (e) => actions.setProfileField("dueTopX", e.target.value),
    dueFreshness: draft.dueFreshness !== undefined ? draft.dueFreshness : 50,
    onDueFreshness: (e) => actions.setProfileField("dueFreshness", e.target.value),

    onSubmit: actions.submitProfile,
    onCancel: actions.cancelEditProfile,
  };
}
