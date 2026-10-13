import { describe, expect, it } from "vitest";
import { taskFilesAt } from "./worklist.ts";

const worklist = (files: string) => `# Work\n\n### ZZ.1 — An example\n- **Status:** todo\n- **Files:** ${files}\n- **Do:** it\n`;
const at = (hour: number) => `2030-01-01T${String(hour).padStart(2, "0")}:00:00.000Z`;

describe("taskFilesAt", () => {
  const versions = [
    { time: at(9), text: worklist("`lib/**`") },
    { time: at(11), text: worklist("`lib/**`, `notes.md`") },
    { time: at(13), text: "# Work\n" },
  ];

  it("takes the version committed last before the time and the next one", () => {
    expect(taskFilesAt(versions, "ZZ.1", at(10))).toEqual({ include: ["lib/**", "notes.md"], exclude: [] });
    expect(taskFilesAt(versions, "ZZ.1", at(8))).toEqual({ include: ["lib/**"], exclude: [] });
    expect(taskFilesAt(versions, "ZZ.1", at(12))).toEqual({ include: ["lib/**", "notes.md"], exclude: [] });
  });

  it("is undefined when neither version has the task", () => {
    expect(taskFilesAt(versions, "ZZ.1", at(14))).toBeUndefined();
    expect(taskFilesAt(versions, "ZZ.2", at(10))).toBeUndefined();
  });

  it("calls Files that name a folder in another doc prose, over continuation lines too", () => {
    const text = worklist("the server folder\n  named in `ARCHITECTURE.md`, `package.json`");
    expect(taskFilesAt([{ time: at(9), text }], "ZZ.1", at(10))).toBe("prose");
  });

  it("reads 'root config' on a continuation line", () => {
    const text = worklist("`lib/**`,\n  root config");
    expect(taskFilesAt([{ time: at(9), text }], "ZZ.1", at(10))).toEqual({ include: ["lib/**", "*"], exclude: [] });
  });

  it("widens the Files for 'anything' and 'root config'", () => {
    expect(taskFilesAt([{ time: at(9), text: worklist("anything, for small fixes only") }], "ZZ.1", at(10))).toEqual({
      include: ["**"],
      exclude: [],
    });
    expect(taskFilesAt([{ time: at(9), text: worklist("`lib/**`, root config") }], "ZZ.1", at(10))).toEqual({
      include: ["lib/**", "*"],
      exclude: [],
    });
  });
});
