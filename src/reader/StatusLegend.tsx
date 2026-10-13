import type { Section } from "../manual";
import { StatusRing } from "../ui";
import "./StatusLegend.css";

const LEGEND_WORDS: Record<Section["status"], string> = {
  written: "Written",
  writing: "Writing",
  unwritten: "Not written",
};

export function StatusLegend() {
  return (
    <ul className="status-legend" aria-label="Section status key">
      {(["written", "writing", "unwritten"] as const).map((status) => (
        <li key={status}>
          <StatusRing status={status} />
          {LEGEND_WORDS[status]}
        </li>
      ))}
    </ul>
  );
}
