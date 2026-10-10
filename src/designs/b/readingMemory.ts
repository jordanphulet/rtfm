const sectionsStreamedThisLoad = new Set<string>();
let lastOpenedId: string | undefined;

export function rememberOpening(id: string, streams: boolean) {
  if (streams) sectionsStreamedThisLoad.add(id);
  lastOpenedId = id;
}

export function hasStreamedThisLoad(id: string): boolean {
  return sectionsStreamedThisLoad.has(id);
}

export function lastOpenedSection(): string | undefined {
  return lastOpenedId;
}
