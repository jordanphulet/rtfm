import type { Manual } from "../../../shared";

type StoreyKind = "floor" | "gable" | "basement";

export interface Storey {
  kind: StoreyKind;
  sectionIds: string[][];
  hasDoor: boolean;
}

export function planHouse(manual: Manual): Storey[] {
  const ids = (sections: { id: string }[]) => sections.map((section) => section.id);
  const floors = manual.chapters.slice(0, -1);
  const gable = manual.chapters.at(-1);
  return [
    { kind: "basement", sectionIds: manual.appendices.map((appendix) => ids(appendix.sections)), hasDoor: false },
    ...floors.map((chapter, index) => ({
      kind: "floor" as const,
      sectionIds: [ids(chapter.sections)],
      hasDoor: index === 0,
    })),
    ...(gable ? [{ kind: "gable" as const, sectionIds: [ids(gable.sections)], hasDoor: false }] : []),
  ];
}
