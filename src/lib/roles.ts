export type AppRole = "admin" | "chef" | "staff" | "customer";

const ROLE_MAP: Record<string, AppRole> = {
  // Admin — full access: dashboard, kitchen, settings, POS, kiosk
  "admin@fentongyro.com": "admin",

  // Chef — kitchen display access
  "chef@fentongyro.com": "chef",

  // Staff — POS and kiosk access
  "pos@fentongyro.com": "staff",
  "kiosk@fentongyro.com": "staff",
};

/**
 * Default credentials (create these accounts at /auth → Sign Up):
 *
 *   admin@fentongyro.com   / FentonAdmin2024!   → Admin
 *   chef@fentongyro.com    / FentonChef2024!    → Kitchen
 *   pos@fentongyro.com     / FentonPOS2024!     → POS
 *   kiosk@fentongyro.com   / FentonKiosk2024!   → Kiosk
 */

export function getRoleForEmail(email: string | undefined): AppRole {
  if (!email) return "customer";
  return ROLE_MAP[email.toLowerCase()] ?? "customer";
}
