import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Arrow } from "./drawings";

const ROOM_BELOW_EDGE = 160;
const STOP_EVENTS = ["wheel", "touchmove", "pointerdown", "keydown"] as const;

interface FollowButtonProps {
  bodyRef: RefObject<HTMLElement | null>;
  edgeRef: RefObject<number>;
  text: string;
}

export function FollowButton({ bodyRef, edgeRef, text }: FollowButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isEdgeBelow, setIsEdgeBelow] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);

  const check = useCallback(() => {
    if (bodyRef.current) setIsEdgeBelow(edgeTop(bodyRef.current, edgeRef) > window.innerHeight - ROOM_BELOW_EDGE / 2);
  }, [bodyRef, edgeRef]);

  useEffect(() => {
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [check]);

  useEffect(check, [check, text]);

  useEffect(() => {
    if (!isFollowing || !bodyRef.current) return;
    const distance = edgeTop(bodyRef.current, edgeRef) - (window.innerHeight - ROOM_BELOW_EDGE);
    window.scrollBy({ top: distance, behavior: scrollBehavior() });
  }, [isFollowing, bodyRef, edgeRef, text]);

  useEffect(() => {
    if (!isFollowing) return;
    const stop = (event: Event) => {
      if (event.target !== buttonRef.current) setIsFollowing(false);
    };
    STOP_EVENTS.forEach((name) => window.addEventListener(name, stop, { passive: true }));
    return () => STOP_EVENTS.forEach((name) => window.removeEventListener(name, stop));
  }, [isFollowing]);

  useLayoutEffect(() => {
    const button = buttonRef.current;
    return () => {
      if (button === document.activeElement) bodyRef.current?.focus({ preventScroll: true });
    };
  }, [bodyRef]);

  return (
    <button
      ref={buttonRef}
      type="button"
      className="follow-button"
      aria-pressed={isFollowing}
      data-shown={isFollowing || isEdgeBelow || hasFocus || undefined}
      onClick={() => setIsFollowing(!isFollowing)}
      onFocus={() => setHasFocus(true)}
      onBlur={() => setHasFocus(false)}
    >
      <span className="follow-words">{isFollowing ? "Following the writing" : "Follow the writing"}</span>
      <Arrow direction="down" />
    </button>
  );
}

function edgeTop(body: HTMLElement, edgeRef: RefObject<number>): number {
  return body.getBoundingClientRect().top + edgeRef.current;
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
