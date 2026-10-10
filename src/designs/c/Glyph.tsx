const paths = {
  arrowRight: "M2 8h12M9 3l5 5-5 5",
  arrowUpRight: "M4 12l8-8M5 4h7v7",
  arrowDown: "M8 2v12M3 9l5 5 5-5",
  return: "M13 3v5a3 3 0 0 1-3 3H3M6 8l-3 3 3 3",
  chevronLeft: "M10 3l-5 5 5 5",
  chevronRight: "M6 3l5 5-5 5",
  close: "M3.5 3.5l9 9M12.5 3.5l-9 9",
  list: "M1 4h14M1 8h10M1 12h14",
};

export type GlyphName = keyof typeof paths;

interface GlyphProps {
  name: GlyphName;
  size?: "text" | "ui";
}

export function Glyph({ name, size = "text" }: GlyphProps) {
  return (
    <svg className="c-glyph" data-size={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={paths[name]} />
    </svg>
  );
}
