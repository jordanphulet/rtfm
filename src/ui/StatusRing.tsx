import "./status-ring.css";

export type RingStatus = "unwritten" | "writing" | "written";

export function StatusRing({ status }: { status: RingStatus }) {
  return <span className="ring" data-status={status} aria-hidden="true" />;
}
