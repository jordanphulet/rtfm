import type { Page } from "playwright";
import type * as ManualModule from "../src/manual/sample/index.ts";
import {
  captureAll,
  DESKTOP,
  emptyDir,
  PHONE,
  printSummary,
  settle,
  startServer,
  type Capture,
  type Size,
} from "./screenshots.ts";

const PORT = 5174;
const OUT_DIR = "shots/reader";
const TOC_TOGGLE_TIMEOUT_MS = 3000;
const TOC_TOGGLE = "[data-shot=toc-toggle]";

type Shot = { state: string; path: string; fullPage?: boolean; openToc?: boolean };
type Variant = Size & { onlyStates?: string[] };

const VARIANTS: Variant[] = [
  { name: "desktop", options: DESKTOP },
  { name: "mobile", options: PHONE },
  {
    name: "desktop-reduced",
    options: { ...DESKTOP, reducedMotion: "reduce" },
    onlyStates: ["start", "streaming"],
  },
];

const server = await startServer(PORT);

try {
  await emptyDir(OUT_DIR);
  const manual = (await server.ssrLoadModule("/src/manual/sample/index.ts")) as typeof ManualModule;
  const shots = shotsFor(manual.SHOT_SECTIONS);
  const results = await captureAll(`http://localhost:${PORT}`, VARIANTS, (variant) =>
    capturesFor(variant, shots),
  );
  process.exitCode = printSummary(results) ? 0 : 1;
} finally {
  await server.close();
}

function shotsFor(sections: typeof ManualModule.SHOT_SECTIONS): Shot[] {
  const sectionPath = (id: string) => `/read/${id}`;
  return [
    { state: "start", path: "/read" },
    { state: "toc", path: sectionPath(sections.written), openToc: true },
    { state: "written", path: sectionPath(sections.written), fullPage: true },
    { state: "dense", path: sectionPath(sections.dense), fullPage: true },
    { state: "waiting", path: `${sectionPath(sections.unwritten)}?freeze=0` },
    { state: "streaming", path: `${sectionPath(sections.unwritten)}?freeze=0.5` },
    {
      state: "streaming-full",
      path: `${sectionPath(sections.unwritten)}?freeze=0.5`,
      fullPage: true,
    },
    { state: "appendix", path: sectionPath(sections.appendix), fullPage: true },
  ];
}

function capturesFor(variant: Variant, shots: Shot[]): Capture[] {
  return shots
    .filter((shot) => !variant.onlyStates || variant.onlyStates.includes(shot.state))
    .map((shot) => {
      const name = `${shot.state}-${variant.name}`;
      return {
        path: shot.path,
        file: `${OUT_DIR}/${name}.png`,
        fullPage: shot.fullPage,
        prepare: shot.openToc ? (page) => openToc(page, name) : undefined,
      };
    });
}

async function openToc(page: Page, name: string) {
  const toggle = page.locator(TOC_TOGGLE).filter({ visible: true }).first();
  if ((await toggle.count()) === 0) {
    console.log(`${name}: no visible ${TOC_TOGGLE}`);
    return;
  }
  await toggle.click({ timeout: TOC_TOGGLE_TIMEOUT_MS });
  await settle(page);
}
