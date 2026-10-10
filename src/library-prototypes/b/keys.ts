import type { KeyboardEvent } from "react";

export function hasModifier(event: KeyboardEvent): boolean {
  return event.shiftKey || event.altKey || event.metaKey || event.ctrlKey || event.nativeEvent.isComposing;
}
