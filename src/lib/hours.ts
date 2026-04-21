/**
 * Online ordering hours (America/Chicago).
 * Last-order cutoff is 30 min before actual close so the kitchen has
 * time to prepare before shutting down.
 *
 * Sunday: closed
 * Mon–Sat: 11:00 – 19:30 (7:30 PM)
 */

// minutes since midnight — null means closed all day
const SCHEDULE: (readonly [number, number] | null)[] = [
  null,              // 0 Sun
  [11 * 60, 19 * 60 + 30], // 1 Mon
  [11 * 60, 19 * 60 + 30], // 2 Tue
  [11 * 60, 19 * 60 + 30], // 3 Wed
  [11 * 60, 19 * 60 + 30], // 4 Thu
  [11 * 60, 19 * 60 + 30], // 5 Fri
  [11 * 60, 19 * 60 + 30], // 6 Sat
];

function chicagoParts(date: Date): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: dayMap[weekday] ?? 0, minutes: hour * 60 + minute };
}

export function isAcceptingOnlineOrders(now: Date = new Date()): boolean {
  const { day, minutes } = chicagoParts(now);
  const window = SCHEDULE[day];
  if (!window) return false;
  const [open, close] = window;
  return minutes >= open && minutes < close;
}

export function orderingClosedMessage(now: Date = new Date()): string {
  const { day } = chicagoParts(now);
  if (SCHEDULE[day] === null) {
    return "We're closed on Sundays. Online ordering reopens Monday at 11:00 AM.";
  }
  return "Online ordering is closed right now. We accept orders Mon–Sat, 11:00 AM – 7:30 PM.";
}
