import type { LucideIcon } from "lucide-react";

export function Icon({ of: Glyph }: { of: LucideIcon }) {
  return <Glyph className="icon" size={16} strokeWidth={1.75} aria-hidden="true" />;
}
