import { test } from "node:test";
import assert from "node:assert/strict";
import { safeRedirect } from "../../src/lib/auth/safe-redirect.ts";
test("scanner MFA return allows only the exact self-service endpoint", () => {
  assert.equal(safeRedirect("/scanner/mfa"), "/scanner/mfa");
  for (const value of [
    "/scanner",
    "/scanner/other",
    "/scanner/mfa/",
    "/scanner/mfa/private",
    "/scanner/mfa?redirect=https://evil.invalid",
    "/scanner/mfa#secret",
    "//evil.invalid/scanner/mfa",
    "/scanner\\mfa",
    "/scanner%2fmfa",
    "/other/../scanner/mfa",
  ])
    assert.equal(safeRedirect(value), "/member", value);
});
test("existing owner and ADMIN_TEST returns stay intact", () => {
  for (const value of ["/member", "/member/pass?event=synthetic", "/admin/mfa", "/apply"])
    assert.equal(safeRedirect(value), value);
});
