import type { Section } from "../../shared";

export function Leaf({ status }: { status: Section["status"] }) {
  return (
    <svg className="leaf" data-status={status} width="12" height="16" viewBox="0 0 12 16" aria-hidden="true">
      <path d="M0.5 0.5h7l4 4v11h-11z M7.5 0.5v4h4" />
      {status !== "unwritten" && (
        <g className="leaf-lines">
          <path d="M2.5 7.5h7" pathLength={1} />
          <path d="M2.5 10h7" pathLength={1} />
          <path className="leaf-line-last" d="M2.5 12.5h5" pathLength={1} />
        </g>
      )}
    </svg>
  );
}

export function Ribbon() {
  return (
    <svg className="ribbon" width="10" height="28" viewBox="0 0 10 28" aria-hidden="true">
      <path d="M0 0h10v28l-5-6-5 6z" />
    </svg>
  );
}

function Lozenge() {
  return (
    <svg className="lozenge" width="5" height="5" viewBox="0 0 6 6" aria-hidden="true">
      <path d="M3 0l3 3-3 3-3-3z" />
    </svg>
  );
}

export function HeadRule() {
  return (
    <svg className="head-rule" width="104" height="6" viewBox="0 0 104 6" aria-hidden="true">
      <path className="ornament-lozenge" d="M3 0l3 3-3 3-3-3z" />
      <path className="ornament-hairline" d="M8 3.5h96" pathLength={1} />
    </svg>
  );
}

export function Asterism() {
  return (
    <div className="asterism" role="separator">
      <Lozenge />
      <Lozenge />
      <Lozenge />
    </div>
  );
}

export function Tailpiece() {
  return (
    <svg className="tailpiece" width="96" height="6" viewBox="0 0 96 6" aria-hidden="true">
      <path className="ornament-hairline" d="M43 3.5h-40" pathLength={1} />
      <path className="ornament-lozenge" d="M48 0l3 3-3 3-3-3z" />
      <path className="ornament-hairline" d="M53 3.5h40" pathLength={1} />
    </svg>
  );
}

export function Nib() {
  return (
    <svg className="nib" width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">
      <path d="M5 16 L0.5 7 L2 1 h6 l1.5 6 z" />
      <path className="nib-slit" d="M5 15 V8" />
      <circle className="nib-slit" cx="5" cy="7" r="1.1" />
    </svg>
  );
}

export function Arrow({ direction }: { direction: "left" | "right" | "down" }) {
  const paths = {
    right: "M1 6h11 M8 2l4 4-4 4",
    left: "M13 6h-11 M6 2l-4 4 4 4",
    down: "M7 0v11 M3 7l4 4 4-4",
  };
  return (
    <svg className="arrow" width="14" height="12" viewBox="0 0 14 12" aria-hidden="true">
      <path d={paths[direction]} />
    </svg>
  );
}

export function OutboundArrow() {
  return (
    <svg className="outbound" width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
      <path d="M1 7l6-6 M2.5 0.5h5v5" />
    </svg>
  );
}

export function ReturnHook() {
  return (
    <svg className="return-hook" width="12" height="10" viewBox="0 0 12 10" aria-hidden="true">
      <path d="M11 0.5v4.5h-9 M5 2l-3 3 3 3" />
    </svg>
  );
}
