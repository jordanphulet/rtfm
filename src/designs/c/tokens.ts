import { instrumentSans } from "../../shared/fonts/instrument-sans";
import { jetbrainsMono } from "../../shared/fonts/jetbrains-mono";
import { literata } from "../../shared/fonts/literata";

export const colors = {
  bg: "#0A0F15",
  bgCellar: "#070B10",
  bgRaised: "#121820",
  bgHover: "#1A222C",
  scrim: "rgb(5 8 11 / 0.72)",
  ink: "#CDD5DC",
  ink2: "#9DA8B2",
  ink3: "#828E99",
  ink4: "#66727E",
  line: "#1E2731",
  lineStrong: "#334150",
  select: "#263444",
  lit: "#CDAE7C",
  lamp: "#E0A85E",
  wall: "#2A3542",
  trim: "#344252",
  roof: "#1F2833",
  glass: "#0C1219",
  moon: "#B4C3D4",
  sky: "#3A4A5C",
};

export const timing = {
  fast: 150,
  base: 200,
  slow: 240,
  previewDelay: 120,
};

export const develop = {
  levels: [
    { highlight: "c-fresh-1", characters: 24 },
    { highlight: "c-fresh-2", characters: 40 },
    { highlight: "c-fresh-3", characters: 48 },
  ],
};

const spaceSteps = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96, 128];

export function space(step: number) {
  return spaceSteps[step - 1];
}

function spaceVariables() {
  return Object.fromEntries(spaceSteps.map((pixels, index) => [`--space-${index + 1}`, `${pixels}px`]));
}

export const layout = {
  measure: 672,
  laneGap: 56,
  lane: 288,
  bottomBar: 52,
};

export const media = {
  wide: "(min-width: 1280px)",
  narrow: "(max-width: 1099px)",
  previews: "(min-width: 601px) and (hover: hover) and (pointer: fine)",
  reducedMotion: "(prefers-reduced-motion: reduce)",
};

const cssVariables: Record<string, string> = {
  "--bg": colors.bg,
  "--bg-cellar": colors.bgCellar,
  "--page-bg": colors.bg,
  "--bg-raised": colors.bgRaised,
  "--bg-hover": colors.bgHover,
  "--scrim": colors.scrim,
  "--ink": colors.ink,
  "--ink-2": colors.ink2,
  "--ink-3": colors.ink3,
  "--ink-4": colors.ink4,
  "--line": colors.line,
  "--line-strong": colors.lineStrong,
  "--select": colors.select,
  "--lit": colors.lit,
  "--lamp": colors.lamp,
  "--glass": colors.glass,
  "--fresh-1": `color-mix(in oklab, ${colors.ink} 40%, ${colors.bg})`,
  "--fresh-2": `color-mix(in oklab, ${colors.ink} 62%, ${colors.bg})`,
  "--fresh-3": `color-mix(in oklab, ${colors.ink} 80%, ${colors.bg})`,

  "--font-text": literata,
  "--font-ui": instrumentSans,
  "--font-code": jetbrainsMono,

  "--size-micro": "12px",
  "--size-caption": "13px",
  "--size-small": "15px",
  "--size-summary": "18px",
  "--size-body": "21px",
  "--size-h2": "25px",
  "--size-h1": "36px",
  "--size-title": "44px",
  "--size-code": "16px",
  "--size-data": "18px",
  "--size-note": "18px",
  "--lh-micro": "16px",
  "--lh-caption": "20px",
  "--lh-small": "24px",
  "--lh-summary": "28px",
  "--lh-body": "34px",
  "--lh-h2": "32px",
  "--lh-h1": "44px",
  "--lh-title": "52px",
  "--lh-code": "26px",
  "--lh-data": "28px",
  "--lh-note": "28px",

  ...spaceVariables(),

  "--measure": `${layout.measure}px`,
  "--mark-col": "7px",
  "--label-col": "36px",
  "--label-col-wide": "40px",
  "--glyph-ui": "16px",
  "--lane-gap": `${layout.laneGap}px`,
  "--lane": `${layout.lane}px`,
  "--wide-left": "240px",
  "--bottom-bar": `${layout.bottomBar}px`,

  "--radius": "2px",
  "--t-fast": `${timing.fast}ms`,
  "--t-base": `${timing.base}ms`,
  "--t-slow": `${timing.slow}ms`,
  "--t-flash": "900ms",
  "--ease-out": "cubic-bezier(0.2, 0, 0, 1)",
};

const phoneVariables: Record<string, string> = {
  "--size-small": "13px",
  "--size-summary": "16px",
  "--size-body": "16px",
  "--size-h2": "19px",
  "--size-h1": "28px",
  "--size-title": "33px",
  "--size-code": "13px",
  "--size-data": "16px",
  "--size-note": "16px",
  "--lh-small": "20px",
  "--lh-summary": "24px",
  "--lh-body": "26px",
  "--lh-h2": "26px",
  "--lh-h1": "34px",
  "--lh-title": "40px",
  "--lh-code": "20px",
  "--lh-data": "24px",
  "--lh-note": "26px",
};

function declarations(variables: Record<string, string>) {
  return Object.entries(variables)
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ");
}

export const tokenStylesheet = `:root { ${declarations(cssVariables)} }
@media (max-width: 600px) { :root { ${declarations(phoneVariables)} } }`;
