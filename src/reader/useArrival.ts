import { useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router";

type FocusTarget = (hashTarget: HTMLElement | null) => HTMLElement | null | undefined;

export function useArrival(focusTargetAfterLink: FocusTarget) {
  const { hash } = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    const hashTarget = elementForHash(hash);
    if (hashTarget) hashTarget.scrollIntoView();
    else window.scrollTo(0, 0);
    if (navigationType === "PUSH") focusTargetAfterLink(hashTarget)?.focus({ preventScroll: true });
  }, []);
}

function elementForHash(hash: string): HTMLElement | null {
  if (!hash) return null;
  const id = hash.slice(1);
  return document.getElementById(id) ?? document.getElementById(decoded(id));
}

function decoded(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}
