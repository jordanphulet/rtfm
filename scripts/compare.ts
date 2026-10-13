import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

// Shots of one commit match exactly from run to run. The threshold lets a pixel drift by about
// two color steps, which absorbs the anti-aliasing noise Chromium's partial raster can add, and
// a handful of pixels may differ outright before a shot counts as changed.
const COLOR_THRESHOLD = 0.01;
const MAX_DIFFERING_PIXELS = 10;
const DIFFS_DIR = "diffs";

export type ImageComparison = { differingPixels: number; withinTolerance: boolean; diff: PNG };

export function compareImages(actual: PNG, expected: PNG): ImageComparison {
  const width = Math.max(actual.width, expected.width);
  const height = Math.max(actual.height, expected.height);
  const diff = new PNG({ width, height });
  const differingPixels = pixelmatch(
    padded(actual, width, height).data,
    padded(expected, width, height).data,
    diff.data,
    width,
    height,
    { threshold: COLOR_THRESHOLD, includeAA: true },
  );
  return { differingPixels, withinTolerance: differingPixels <= MAX_DIFFERING_PIXELS, diff };
}

/** Says why `baselineDir` can't be compared with a run that writes to `shotsDir`, if it can't. */
export async function baselineProblem(baselineDir: string, shotsDir: string): Promise<string | undefined> {
  if (isWithin(baselineDir, shotsDir) || isWithin(shotsDir, baselineDir)) {
    return `The baseline ${baselineDir} and the output ${shotsDir} must be separate folders.`;
  }
  const baseline = await stat(baselineDir).catch(() => undefined);
  if (!baseline?.isDirectory()) return `The baseline ${baselineDir} isn't a folder.`;
}

/** Compares every shot in `shotsDir` with `baselineDir`'s, prints those that differ, and says whether all match. */
export async function compareShots(shotsDir: string, baselineDir: string): Promise<boolean> {
  const [shots, baseline] = await Promise.all([listShots(shotsDir), listShots(baselineDir)]);
  const files = [...new Set([...baseline, ...shots])].sort();
  const problems: string[] = [];
  for (const file of files) {
    const problem = !shots.has(file)
      ? "missing from this run"
      : !baseline.has(file)
        ? "missing from the baseline"
        : await compareShot(file, shotsDir, baselineDir);
    if (problem) problems.push(`  ${file}  ${problem}`);
  }

  if (problems.length === 0) {
    console.log(`\nAll ${files.length} screenshots match ${baselineDir}.`);
    return true;
  }
  console.log(`\n${problems.length} of ${files.length} screenshots differ from ${baselineDir}:`);
  for (const problem of problems) console.log(problem);
  return false;
}

async function compareShot(file: string, shotsDir: string, baselineDir: string): Promise<string | undefined> {
  const [actual, expected] = await Promise.all([
    readPng(path.join(shotsDir, file)),
    readPng(path.join(baselineDir, file)),
  ]);
  const { differingPixels, withinTolerance, diff } = compareImages(actual, expected);
  if (withinTolerance) return undefined;

  const diffFile = path.join(shotsDir, DIFFS_DIR, file);
  await mkdir(path.dirname(diffFile), { recursive: true });
  await writeFile(diffFile, PNG.sync.write(diff));
  const sizes = sameSize(actual, expected) ? "" : ` (now ${sizeOf(actual)}, was ${sizeOf(expected)})`;
  return `${differingPixels} pixels differ${sizes}, diff in ${diffFile}`;
}

async function listShots(dir: string): Promise<Set<string>> {
  const files = await readdir(dir, { recursive: true });
  return new Set(files.filter((file) => file.endsWith(".png") && !file.startsWith(`${DIFFS_DIR}${path.sep}`)));
}

async function readPng(file: string): Promise<PNG> {
  return PNG.sync.read(await readFile(file));
}

function padded(image: PNG, width: number, height: number): PNG {
  if (image.width === width && image.height === height) return image;
  const canvas = new PNG({ width, height });
  PNG.bitblt(image, canvas, 0, 0, image.width, image.height, 0, 0);
  return canvas;
}

function sameSize(a: PNG, b: PNG): boolean {
  return a.width === b.width && a.height === b.height;
}

function sizeOf(image: PNG): string {
  return `${image.width}×${image.height}`;
}

function isWithin(dir: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(dir));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
