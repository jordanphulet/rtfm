import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "../ui";
import "./tail-line.css";

const FOLLOW_MARGIN = 24;
const KEYS_THAT_SCROLL_UP = ["ArrowUp", "PageUp", "Home"];

interface TailLineProps {
  progress: number;
  textLength: number;
}

export function TailLine({ progress, textLength }: TailLineProps) {
  const [following, setFollowing] = useState(false);
  const lineRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!following || !lineRef.current) return;
    const overshoot = lineRef.current.getBoundingClientRect().bottom - (window.innerHeight - FOLLOW_MARGIN);
    if (overshoot > 0) window.scrollBy({ top: overshoot, behavior: "instant" });
  }, [following, progress, textLength]);

  useEffect(() => {
    if (!following) return;
    const stop = () => setFollowing(false);
    const stopOnWheelUp = (event: WheelEvent) => {
      if (event.deltaY < 0) stop();
    };
    const stopOnKeyUp = (event: KeyboardEvent) => {
      if (KEYS_THAT_SCROLL_UP.includes(event.key)) stop();
    };
    window.addEventListener("wheel", stopOnWheelUp, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    window.addEventListener("keydown", stopOnKeyUp);
    return () => {
      window.removeEventListener("wheel", stopOnWheelUp);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("keydown", stopOnKeyUp);
    };
  }, [following]);

  return (
    <div ref={lineRef} className="tail-line write-head-line" data-live={textLength === 0 || undefined}>
      <span className="tail-progress">Being written · {Math.round(progress * 100)}%</span>
      <button
        type="button"
        className="text-button follow"
        aria-pressed={following}
        onClick={() => setFollowing(!following)}
      >
        {following ? "Following" : "Follow"} ↓
      </button>
    </div>
  );
}
