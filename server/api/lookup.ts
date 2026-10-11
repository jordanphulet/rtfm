import type { ManualStore, StoredManual } from "../storage/types.ts";

export async function manualWithSection(
  store: ManualStore,
  manualId: string,
  sectionId: string,
): Promise<StoredManual | undefined> {
  const manual = await store.getManual(manualId);
  const sections = manual ? [...manual.chapters, ...manual.appendices].flatMap((chapter) => chapter.sections) : [];
  return sections.some((section) => section.id === sectionId) ? manual : undefined;
}
