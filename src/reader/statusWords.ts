import type { FailureReason, Section } from "../manual";

export const STATUS_WORDS: Record<Section["status"], string> = {
  unwritten: "Not yet written",
  writing: "Being written",
  written: "Written",
};

export const FAILURE_WORDS: Record<FailureReason, string> = {
  budget: "budget reached",
  error: "couldn’t write this section",
};

export const FAILURE_NOTICES: Record<FailureReason, { title: string; lead: string; afterRetry: string }> = {
  budget: {
    title: "Budget reached",
    lead: "The writing budget won’t cover this section right now, so it stays unwritten, and nothing was charged for it.",
    afterRetry: " once the budget allows.",
  },
  error: {
    title: "Couldn’t write this section",
    lead: "Something went wrong while it was being written, so none of it was kept.",
    afterRetry: " to write it from the start.",
  },
};
