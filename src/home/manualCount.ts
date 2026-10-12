export function manualCount(count: number): string {
  if (count === 0) return "No manuals";
  return count === 1 ? "1 manual" : `${count} manuals`;
}
