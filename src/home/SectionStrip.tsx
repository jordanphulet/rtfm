import "./section-strip.css";

export function SectionStrip({ written, total }: { written: number; total: number }) {
  return (
    <span className="section-strip" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className="tick" data-written={index < written || undefined} />
      ))}
    </span>
  );
}
