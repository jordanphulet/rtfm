import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { Glyph } from "./Glyph";
import { layout, media } from "./tokens";
import { useReducedMotion } from "./useReducedMotion";
import { WindowMark } from "./WindowMark";
import "./follow-control.css";

interface FollowControlProps {
  proseRef: RefObject<HTMLElement | null>;
  text: string;
}

const STOP_KEYS = new Set(["PageUp", "Home", "ArrowUp"]);

export function FollowControl({ proseRef, text }: FollowControlProps) {
  const reducedMotion = useReducedMotion();
  const [following, setFollowing] = useState(false);
  const [newestOutOfView, setNewestOutOfView] = useState(false);
  const [focused, setFocused] = useState(false);

  const measure = useCallback(() => {
    const prose = proseRef.current;
    setNewestOutOfView(prose !== null && distanceBelowView(prose) > lineHeight(prose));
  }, [proseRef]);

  useEffect(() => {
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  useLayoutEffect(() => {
    if (following) scrollNewestIntoView(proseRef.current, "instant");
    measure();
  }, [proseRef, measure, following, text]);

  useEffect(() => {
    if (!following) return;
    const stop = () => setFollowing(false);
    const stopOnUpwardWheel = (event: WheelEvent) => event.deltaY < 0 && stop();
    const stopOnKey = (event: KeyboardEvent) => STOP_KEYS.has(event.key) && stop();
    window.addEventListener("wheel", stopOnUpwardWheel, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    window.addEventListener("keydown", stopOnKey);
    return () => {
      window.removeEventListener("wheel", stopOnUpwardWheel);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("keydown", stopOnKey);
    };
  }, [following]);

  function toggle() {
    if (following) {
      setFollowing(false);
      return;
    }
    scrollNewestIntoView(proseRef.current, reducedMotion ? "instant" : "smooth");
    setFollowing(true);
  }

  const shown = following || newestOutOfView || focused;
  return (
    <div className="c-follow" data-visible={shown || undefined} inert={!shown}>
      <button
        type="button"
        className="c-follow-button"
        aria-pressed={following}
        onClick={toggle}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <WindowMark status="writing" spoken={false} />
        {following ? "Following · stop" : "Follow the writing"}
        {!following && <Glyph name="arrowDown" />}
      </button>
    </div>
  );
}

function lineHeight(prose: HTMLElement) {
  return parseFloat(getComputedStyle(prose).lineHeight);
}

function newestLineBottom(prose: HTMLElement | null) {
  const blocks = prose?.firstElementChild?.children;
  if (!blocks) return 0;
  const lastBlock = [...blocks].findLast((block) => !block.matches("section[data-footnotes]"));
  return lastBlock?.getBoundingClientRect().bottom ?? 0;
}

function viewBottom() {
  const covered = window.matchMedia(media.narrow).matches ? layout.bottomBar : 0;
  return window.innerHeight - covered;
}

function distanceBelowView(prose: HTMLElement) {
  return newestLineBottom(prose) - viewBottom();
}

function scrollNewestIntoView(prose: HTMLElement | null, behavior: ScrollBehavior) {
  const overshoot = newestLineBottom(prose) - viewBottom() * (2 / 3);
  if (overshoot > 0) window.scrollBy({ top: overshoot, behavior });
}
