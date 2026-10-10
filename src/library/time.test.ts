import { describe, expect, it } from "vitest";
import { formatLastOpened, localTime } from "./time";

describe("formatLastOpened", () => {
  it.each([
    ["2026-10-10T15:59", "today"],
    ["2026-10-10T00:01", "today"],
    ["2026-10-09T23:59", "yesterday"],
    ["2026-10-07T09:00", "3 days ago"],
    ["2026-10-04T09:00", "6 days ago"],
    ["2026-10-03T09:00", "Oct 3"],
    ["2026-03-02T09:00", "Mar 2"],
    ["2025-12-28T23:45", "Dec 28, 2025"],
  ])("formats %s as %s", (dateTime, expected) => {
    expect(formatLastOpened(localTime(dateTime))).toBe(expected);
  });
});
