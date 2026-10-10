import type { Section } from "../manual";

export const STATUS_WORDS: Record<Section["status"], string> = {
  unwritten: "Not yet written",
  writing: "Being written",
  written: "Written",
};
