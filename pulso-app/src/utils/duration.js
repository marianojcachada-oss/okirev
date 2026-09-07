// Formats a duration in seconds the same way Insightful-style reports do:
// >= 1 hour  -> "Xh Ym"      (seconds dropped once we're at hour scale)
// >= 1 minute -> "Xm Ys"
// < 1 minute  -> "Xs"        (covers exactly 0 too)
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}
