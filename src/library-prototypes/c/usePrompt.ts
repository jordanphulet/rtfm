import { useCallback, useRef, useState, type RefObject } from "react";

const STARTER_PROMPT = "Let’s start a new manual about ";

export interface Prompt {
  draft: string;
  setDraft: (draft: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  focusInput: () => void;
  startNewManual: () => void;
}

export function usePrompt(): Prompt {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const focusInput = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  function startNewManual() {
    if (draft.trim() === "") setDraft(STARTER_PROMPT);
    requestAnimationFrame(focusInput);
  }

  return { draft, setDraft, inputRef, focusInput, startNewManual };
}
