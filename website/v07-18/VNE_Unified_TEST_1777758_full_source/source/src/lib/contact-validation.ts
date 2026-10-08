/** Demo-only local check of a single contact value. Never sends data anywhere. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_CHARS = /^\+?[\d\s()-]+$/;

export function isValidContact(raw: string): boolean {
  const value = raw.trim();
  if (!value || value.length > 254) return false;
  if (value.includes("@")) return EMAIL.test(value);
  if (!PHONE_CHARS.test(value)) return false;
  const digits = value.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15;
}
