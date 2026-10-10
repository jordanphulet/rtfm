import type { Section } from "../manual";
import "./status-ring.css";

export const STATUS_WORDS: Record<Section["status"], string> = {
  unwritten: "Not yet written",
  writing: "Being written",
  written: "Written",
};

export function StatusRing({ status }: { status: Section["status"] }) {
  return <span className="ring" data-status={status} aria-hidden="true" />;
}

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
