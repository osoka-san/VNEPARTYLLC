import { ADMIN_TEST_ID } from "./admin-mfa-core";
/** TEST build only. Never import this mapping into a browser module. */
export function mapTestAdminIdentifier(identifier: string, enabled: boolean) {
  if (enabled && identifier.trim().toUpperCase() === "ADMIN_TEST") {
    return { email: "savik3003@gmail.com", expectedUserId: ADMIN_TEST_ID };
  }
  return { email: identifier, expectedUserId: null };
}
