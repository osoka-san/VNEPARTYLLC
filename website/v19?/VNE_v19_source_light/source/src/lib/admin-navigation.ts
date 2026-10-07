export const ADMIN_SECTIONS = [
  "motion",
  "requests",
  "team",
  "overview",
  "accounts",
  "content",
  "operations",
  "tickets",
  "qr-studio",
] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number];
export function adminSection(value: unknown): AdminSection {
  return typeof value === "string" && (ADMIN_SECTIONS as readonly string[]).includes(value)
    ? (value as AdminSection)
    : "overview";
}
export const isAdminPath = (path: string) => path === "/admin" || path.startsWith("/admin/");
export function activeAdminSection(path: string, section: unknown) {
  if (path === "/admin") return adminSection(section);
  const child = path.slice("/admin/".length).split("/")[0];
  return child ?? "overview";
}
