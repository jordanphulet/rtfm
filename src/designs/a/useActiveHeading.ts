import { useEffect, useState } from "react";

const READING_LINE = 0.25;

export function useActiveHeading(ids: string[]): string | undefined {
  const [activeId, setActiveId] = useState<string>();
  const idList = ids.join(" ");

  useEffect(() => {
    const watchedIds = idList.split(" ").filter(Boolean);
    let frame = 0;

    const update = () => {
      frame = 0;
      const line = window.innerHeight * READING_LINE;
      const passed = watchedIds.filter((id) => {
        const heading = document.getElementById(id);
        return heading !== null && heading.getBoundingClientRect().top <= line;
      });
      setActiveId(passed.at(-1));
    };
    const scheduleUpdate = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [idList]);

  return activeId;
}
