import test from "node:test";
import assert from "node:assert/strict";

import { emailAllowed, ALLOWED_DOMAINS, PRIMARY_DOMAIN } from "../src/firebase.js";

test("emailAllowed accepts only the approved Acts 2 Network domains", () => {
  assert.deepEqual(ALLOWED_DOMAINS, ["gpmail.org", "acts2.network"]);
  assert.equal(emailAllowed("member@gpmail.org"), true);
  assert.equal(emailAllowed("member@acts2.network"), true);
  assert.equal(emailAllowed("Member@ACTS2.Network"), true, "case-insensitive");
  assert.equal(emailAllowed("member@gmail.com"), false);
  assert.equal(emailAllowed("member@evilgpmail.org"), false, "must match full domain");
  assert.equal(emailAllowed("member@gpmail.org.evil.com"), false);
  assert.equal(emailAllowed("member@sub.acts2.network"), false, "subdomains not allowed");
  assert.equal(emailAllowed(null), false);
  assert.equal(emailAllowed(""), false);
});

test("PRIMARY_DOMAIN is one of the allowed domains", () => {
  assert.equal(PRIMARY_DOMAIN, "acts2.network");
  assert.ok(ALLOWED_DOMAINS.includes(PRIMARY_DOMAIN));
});
