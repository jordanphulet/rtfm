import { sampleManual } from "../manual/sample";
import { localTime } from "./time";
import type { LibraryManual } from "./types";

const sampleChapters = [...sampleManual.chapters, ...sampleManual.appendices];
const sampleSections = sampleChapters.flatMap((chapter) => chapter.sections);

export const seedManuals: LibraryManual[] = [
  {
    id: sampleManual.id,
    title: sampleManual.title,
    subtitle: sampleManual.subtitle,
    chapterCount: sampleChapters.length,
    sectionCount: sampleSections.length,
    writtenCount: sampleSections.filter((section) => section.status === "written").length,
    lastOpenedAt: localTime("2026-10-10T14:05"),
  },
  {
    id: "the-birthday-party-field-manual",
    title: "The Birthday Party Field Manual",
    subtitle: "Planning, hosting and surviving a party for twelve seven-year-olds",
    chapterCount: 4,
    sectionCount: 14,
    writtenCount: 3,
    lastOpenedAt: localTime("2026-10-09T20:40"),
  },
  {
    id: "negotiating-with-geese",
    title: "Negotiating With Geese",
    subtitle: "Field tactics for parks, golf courses and office campuses",
    chapterCount: 2,
    sectionCount: 6,
    writtenCount: 1,
    lastOpenedAt: localTime("2026-10-07T09:15"),
  },
  {
    id: "keeping-a-sourdough-starter-alive",
    title: "Keeping a Sourdough Starter Alive",
    subtitle: "Feeding schedules, rescue protocols, and who looks after it while you’re on holiday",
    chapterCount: 3,
    sectionCount: 9,
    writtenCount: 9,
    lastOpenedAt: localTime("2026-10-05T08:30"),
  },
  {
    id: "running-your-own-mail-server",
    title: "Running Your Own Mail Server Without Losing Your Mind",
    subtitle: "DNS records, deliverability, and the long war with spam filters",
    chapterCount: 8,
    sectionCount: 31,
    writtenCount: 12,
    lastOpenedAt: localTime("2026-09-21T22:10"),
  },
  {
    id: "moving-house-without-losing-the-cat",
    title: "Moving House Without Losing the Cat",
    subtitle: "Boxes, timelines and feline diplomacy",
    chapterCount: 5,
    sectionCount: 17,
    writtenCount: 0,
    lastOpenedAt: localTime("2026-08-02T11:00"),
  },
  {
    id: "building-a-backyard-observatory",
    title: "Building a Backyard Observatory",
    subtitle: "From a concrete pier to your first photograph of Saturn",
    chapterCount: 6,
    sectionCount: 22,
    writtenCount: 15,
    lastOpenedAt: localTime("2025-12-28T23:45"),
  },
];
