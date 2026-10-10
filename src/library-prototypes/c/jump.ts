export const LIBRARY_TITLE_ID = "library-title";

export function jumpTo(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ block: "start", behavior: "instant" });
  target.focus({ preventScroll: true });
}

export function jumpToLibrary() {
  window.scrollTo({ top: 0, behavior: "instant" });
  document.getElementById(LIBRARY_TITLE_ID)?.focus({ preventScroll: true });
}
