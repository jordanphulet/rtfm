export function flash(element: HTMLElement) {
  element.removeAttribute("data-flash");
  void element.offsetWidth;
  element.setAttribute("data-flash", "");

  const stop = () => {
    element.removeAttribute("data-flash");
    element.removeEventListener("animationend", onAnimationEnd);
    element.removeEventListener("focusout", onFocusOut);
  };
  const onAnimationEnd = (event: AnimationEvent) => {
    if (event.target === element) stop();
  };
  const onFocusOut = (event: FocusEvent) => {
    if (!element.contains(event.relatedTarget as Node | null)) stop();
  };
  element.addEventListener("animationend", onAnimationEnd);
  element.addEventListener("focusout", onFocusOut);
}

export async function collapse(element: HTMLElement) {
  const style = getComputedStyle(element);
  const duration = parseFloat(style.getPropertyValue("--dur-base"));
  if (!duration) return;

  const animation = element.animate(
    [
      { height: `${element.offsetHeight}px`, opacity: 1 },
      { height: "0px", paddingBlock: "0px", marginBlock: "0px", opacity: 0 },
    ],
    { duration, easing: style.getPropertyValue("--ease-in-out").trim(), fill: "forwards" },
  );
  await animation.finished;
}
