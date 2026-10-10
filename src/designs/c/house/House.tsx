import { useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useManual, type Manual } from "../../../shared";
import { allSections, sectionPath } from "../manualParts";
import { useReducedMotion } from "../useReducedMotion";
import { planHouse } from "./plan";
import type { HouseScene } from "./scene";
import "./house.css";

interface HouseProps {
  hoveredId?: string;
  onHover: (sectionId: string | undefined) => void;
  onUnavailable: () => void;
}

export function House({ hoveredId, onHover, onUnavailable }: HouseProps) {
  const manual = useManual();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<HouseScene | null>(null);
  const latest = useRef({ manual, hoveredId, reducedMotion, onHover, onUnavailable, navigate });
  useLayoutEffect(() => {
    latest.current = { manual, hoveredId, reducedMotion, onHover, onUnavailable, navigate };
  });

  useEffect(() => {
    let cancelled = false;
    import("./scene")
      .then(({ createHouseScene }) => {
        if (cancelled || !canvas.current) return;
        const current = latest.current;
        scene.current = createHouseScene(canvas.current, {
          storeys: planHouse(current.manual),
          doorSectionId: allSections(current.manual)[0].id,
          reducedMotion: current.reducedMotion,
          onHover: (sectionId) => latest.current.onHover(sectionId),
          onPick: (sectionId) => latest.current.navigate(sectionPath(sectionId)),
        });
        scene.current.setStatuses(statusesOf(current.manual));
        scene.current.setHovered(current.hoveredId);
      })
      .catch(() => {
        if (!cancelled) latest.current.onUnavailable();
      });
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => scene.current?.setStatuses(statusesOf(manual)), [manual]);
  useEffect(() => scene.current?.setHovered(hoveredId), [hoveredId]);
  useEffect(() => scene.current?.setReducedMotion(reducedMotion), [reducedMotion]);

  return <canvas ref={canvas} className="c-house" />;
}

function statusesOf(manual: Manual) {
  return new Map(allSections(manual).map((section) => [section.id, section.status]));
}
