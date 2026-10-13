import { existsSync, globSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOCS_INDEX = "\n## The docs\n";
// These describe what might be and what is planned, not what exists.
const SKIPPED_DOCS = ["research/", "WORKLIST.md"];
const FOLDER_DOCS = ["{server,src,scripts}/**/{README,DESIGN}.md", ".claude/skills/*/SKILL.md"];
const NOT_SEARCHED = ["node_modules", "dist", "shots"];

const FENCE = /^\s*```/;
const CODE_SPAN = /`([^`]+)`/g;
const LINK_TARGET = /\]\(([^)\s]+)\)/g;
const URL_OR_ANCHOR = /^(?:[a-z]+:|#)/i;
const SOURCE_FILE = /^(\.\.\/)*[\w.-]+(\/[\w.-]+)*\.(ts|tsx|css|md)$/;
/** A one-letter name such as `x.ts` stands for any file. */
const ANY_FILE = /^[a-z]\.\w+$/;
const REPO_PATH = /(?<![\w./-])(?:server|src|scripts)\/(?:\{[^}\s]*\}|[^\s`'"(),;{])*/g;
/** A `:line`, `:line-line` or `#anchor` after a path. */
const LOCATION = /(?::\d+(?:-\d+)?|#[\w-]*)$/;
const NPM_SCRIPT = /\bnpm run (?:-{1,2}[\w-]+ )*([\w:-]+)/g;
const SETTING = /\bRTFM_[A-Z0-9_]*[A-Z0-9]/g;
const SETTING_READ = /process\.env\.(RTFM_\w+)/g;
const API_ROUTE = /(?:\b(GET|POST|PUT|PATCH|DELETE) )?(?<![\w./-])(\/api\/[^\s`'"(),;?]+)/g;
const ROUTE_DEFINITION = /method: "(\w+)",\s*pattern: (?:"([^"]+)"|(\w+))/g;
const PLACEHOLDER = /^(?:<.*>|\*|…)$/;

type Snippet = { line: number; text: string };
type Problem = { line: number; message: string };
type ApiRoute = { method: string; pattern: string };

function read(file: string): string {
  return readFileSync(path.join(REPO_ROOT, file), "utf8");
}

function glob(pattern: string): string[] {
  return globSync(pattern, { cwd: REPO_ROOT, exclude: (file) => NOT_SEARCHED.includes(path.basename(file)) });
}

function sourceFiles(pattern: string): string[] {
  return glob(pattern).filter((file) => !file.endsWith(".test.ts"));
}

/** A placeholder such as `<manual>` or `…` stands for any name. */
function asGlob(reference: string): string {
  return reference.replace(/<[^>]*>|…/g, "*").replace(/\/$/, "");
}

function exists(reference: string): boolean {
  const pattern = asGlob(reference);
  return /[*{]/.test(pattern) ? glob(pattern).length > 0 : existsSync(path.join(REPO_ROOT, pattern));
}

/** A folder's docs name its files from the folder itself, so a file may be next to the doc, above it or under it. */
function existsNear(doc: string, file: string): boolean {
  const folder = path.dirname(doc);
  return (
    [folder, path.dirname(folder), "."].some((base) => existsSync(path.join(REPO_ROOT, base, file))) ||
    glob(path.join(folder, "**", file)).length > 0
  );
}

function readmeIndex(): string[] {
  const readme = read("README.md");
  if (!readme.includes(DOCS_INDEX)) throw new Error(`README.md has no "${DOCS_INDEX.trim()}" heading`);
  const index = readme.split(DOCS_INDEX)[1].split("\n## ")[0];
  return [...index.matchAll(CODE_SPAN)].map(([, doc]) => doc).filter((doc) => !SKIPPED_DOCS.includes(doc));
}

function docsToCheck(): string[] {
  const docs = [...readmeIndex(), ...FOLDER_DOCS].flatMap((doc) => glob(asGlob(doc)));
  return [...new Set(["README.md", ...docs])].sort();
}

function settingsRead(): Set<string> {
  const readers = ["server/config.ts", ...sourceFiles("scripts/**/*.ts")];
  return new Set(readers.flatMap((file) => [...read(file).matchAll(SETTING_READ)].map(([, setting]) => setting)));
}

/** Each `method` and `pattern` in server/api, where the pattern is a string or a constant its file defines. */
function serverRoutes(): ApiRoute[] {
  return sourceFiles("server/api/*.ts").flatMap((file) => {
    const source = read(file);
    return [...source.matchAll(ROUTE_DEFINITION)].map(([, method, pattern, constant]) => ({
      method,
      pattern: pattern ?? source.match(new RegExp(`${constant} = "([^"]+)"`))?.[1] ?? constant,
    }));
  });
}

const scripts = Object.keys(JSON.parse(read("package.json")).scripts);
const settings = settingsRead();
const routes = serverRoutes();

function isRoute(method: string | undefined, apiPath: string): boolean {
  const segments = apiPath.split("/");
  return routes.some((route) => {
    const patternSegments = route.pattern.split("/");
    return (
      (method === undefined || method === route.method) &&
      patternSegments.length === segments.length &&
      patternSegments.every(
        (segment, index) => segment.startsWith(":") || PLACEHOLDER.test(segments[index]) || segment === segments[index],
      )
    );
  });
}

/** The doc with its code blocks blanked out, and each line of its code blocks. */
function separateCodeBlocks(text: string): { prose: string; blockLines: Snippet[] } {
  const blockLines: Snippet[] = [];
  let inBlock = false;
  const prose = text
    .split("\n")
    .map((line, index) => {
      if (FENCE.test(line)) {
        inBlock = !inBlock;
        return "";
      }
      if (inBlock) {
        blockLines.push({ line: index + 1, text: line });
        return "";
      }
      return line;
    })
    .join("\n");
  return { prose, blockLines };
}

function lineAt(text: string, index = 0): number {
  return text.slice(0, index).split("\n").length;
}

function problemsIn(doc: string, text: string): string[] {
  const file = text.replace(LOCATION, "");
  if (SOURCE_FILE.test(file)) {
    return ANY_FILE.test(file) || existsNear(doc, file) ? [] : [`\`${file}\` doesn't exist`];
  }

  const missingPaths = [...text.matchAll(REPO_PATH)]
    .map(([reference]) => reference.replace(/[.:]$/, "").replace(LOCATION, ""))
    .filter((reference) => !exists(reference))
    .map((reference) => `\`${reference}\` doesn't exist`);
  const missingScripts = [...text.matchAll(NPM_SCRIPT)]
    .filter(([, name]) => !scripts.includes(name))
    .map(([, name]) => `\`npm run ${name}\` isn't a script in package.json`);
  const unreadSettings = [...text.matchAll(SETTING)]
    .filter(([setting]) => !settings.has(setting))
    .map(([setting]) => `\`${setting}\` isn't read by server/config.ts or a script`);
  const unknownRoutes = [...text.matchAll(API_ROUTE)]
    .map(([, method, apiPath]) => ({ method, apiPath: apiPath.replace(/[./]$/, "") }))
    .filter(({ method, apiPath }) => !isRoute(method, apiPath))
    .map(({ method, apiPath }) => `\`${method ? `${method} ` : ""}${apiPath}\` isn't a route the server defines`);
  return [...missingPaths, ...missingScripts, ...unreadSettings, ...unknownRoutes];
}

function codeProblems(doc: string, prose: string, blockLines: Snippet[]): Problem[] {
  const spans = [...prose.matchAll(CODE_SPAN)].map((span) => ({ line: lineAt(prose, span.index), text: span[1] }));
  return [...blockLines, ...spans].flatMap(({ line, text }) =>
    problemsIn(doc, text).map((message) => ({ line, message })),
  );
}

function linkProblems(doc: string, prose: string): Problem[] {
  return [...prose.matchAll(LINK_TARGET)]
    .filter(([, target]) => !URL_OR_ANCHOR.test(target))
    .filter(([, target]) => !existsSync(path.join(REPO_ROOT, path.dirname(doc), target.replace(/#.*/, ""))))
    .map((link) => ({ line: lineAt(prose, link.index), message: `the link to \`${link[1]}\` leads nowhere` }));
}

function referenceProblems(doc: string, text: string): string[] {
  const { prose, blockLines } = separateCodeBlocks(text);
  return [...codeProblems(doc, prose, blockLines), ...linkProblems(doc, prose)]
    .sort((a, b) => a.line - b.line)
    .map(({ line, message }) => `${doc}:${line}: ${message}`);
}

describe("doc references", () => {
  it.each(docsToCheck())("%s names only what exists", (doc) => {
    expect(referenceProblems(doc, read(doc))).toEqual([]);
  });

  it("checks every doc in README's index, and the folder READMEs and design docs", () => {
    for (const doc of readmeIndex()) expect(glob(asGlob(doc)), doc).not.toEqual([]);
    expect(docsToCheck()).toEqual(expect.arrayContaining(["ARCHITECTURE.md", "CLAUDE.md", "scripts/audit/README.md"]));
  });

  it("reads the server's routes, including one whose pattern is a constant", () => {
    expect(routes).toContainEqual({ method: "POST", pattern: "/api/passcode" });
  });

  it("names the doc and line of each reference to something missing", () => {
    const doc = [
      "Paths: `server/config.ts`, `server/conifg.ts`, `src/<page>/DESIGN.md`, `src/*/nothing.md`.",
      "",
      "Run `npm run usage` or `npm run usages`, `npm run -s usage` or `npm run -s nope`.",
      "",
      "```sh",
      "RTFM_PORT=0 RTFM_PROT=1 npm run server",
      "```",
      "",
      "Routes: `GET /api/manuals/<manualId>`, `POST /api/manuals/:manualId`, `/api/manual`, `/api/*`, `/api/<route>`.",
      "",
      "At: `server/app.ts:1`, `server/app.ts:1-9`, `server/README.md#configuration`, `server/conifg.ts:26`.",
      "Braces: `src/{home,reader}/DESIGN.md`, `src/{home,nowhere}/DESIGN.md`, `src/{nowhere,elsewhere}/DESIGN.md`.",
      "Links: [design](DESIGN.md#the-passcode-screen), [here](#here), [site](https://example.com), [gone](GONE.md).",
    ].join("\n");
    expect(referenceProblems("DOC.md", doc)).toEqual([
      "DOC.md:1: `server/conifg.ts` doesn't exist",
      "DOC.md:1: `src/*/nothing.md` doesn't exist",
      "DOC.md:3: `npm run usages` isn't a script in package.json",
      "DOC.md:3: `npm run nope` isn't a script in package.json",
      "DOC.md:6: `RTFM_PROT` isn't read by server/config.ts or a script",
      "DOC.md:9: `POST /api/manuals/:manualId` isn't a route the server defines",
      "DOC.md:9: `/api/manual` isn't a route the server defines",
      "DOC.md:11: `server/conifg.ts` doesn't exist",
      "DOC.md:12: `src/{nowhere,elsewhere}/DESIGN.md` doesn't exist",
      "DOC.md:13: the link to `GONE.md` leads nowhere",
    ]);
  });

  it("finds a file a folder's doc names from its own folder, above it or under it", () => {
    const doc = [
      "- `runs.ts`: one run per section.",
      "- `../api/types.ts`, `writer/runs.ts` and `agent/librarian/reply.ts`.",
      "- [the server](../README.md), [the runs](./runs.ts).",
    ].join("\n");
    expect(referenceProblems("server/writer/README.md", doc)).toEqual([]);
    expect(referenceProblems("ARCHITECTURE.md", doc.split("\n")[0])).toEqual([]);
    expect(referenceProblems("server/writer/README.md", doc.replaceAll("runs.ts", "runz.ts"))).toEqual([
      "server/writer/README.md:1: `runz.ts` doesn't exist",
      "server/writer/README.md:2: `writer/runz.ts` doesn't exist",
      "server/writer/README.md:3: the link to `./runz.ts` leads nowhere",
    ]);
  });

  it("checks only code and links, not prose, and reads `x.ts` as any file", () => {
    const doc = "Prose may say server/nothing.ts, nothing.ts, npm run nothing and RTFM_NOTHING; `x.ts` is any file.";
    expect(referenceProblems("DOC.md", doc)).toEqual([]);
  });
});
