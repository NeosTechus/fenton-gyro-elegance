export type AppRole = "admin" | "chef" | "customer";

const ROLE_MAP: Record<string, AppRole> = {
  "admin@fentongyro.com": "admin",
  "chef@fentongyro.com": "chef",
};

export function getRoleForEmail(email: string | undefined): AppRole {
  if (!email) return "customer";
  return ROLE_MAP[email.toLowerCase()] ?? "customer";
}
