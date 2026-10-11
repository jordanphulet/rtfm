import type { ManualStore, StoredManual } from "../storage/types.ts";
import { sectionsInReadingOrder } from "../storage/manual.ts";

export async function manualWithSection(
  store: ManualStore,
  manualId: string,
  sectionId: string,
): Promise<StoredManual | undefined> {
  const manual = await store.getManual(manualId);
  const sections = manual ? sectionsInReadingOrder(manual) : [];
  return sections.some((section) => section.id === sectionId) ? manual : undefined;
}
