// The name shown when someone has no app_users row: the part of their email
// before the at sign with the first letter capitalised. Never blank and never
// the full address.
export function fallbackNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim() ?? "";
  if (!local) return "Someone";
  return local.charAt(0).toUpperCase() + local.slice(1);
}
