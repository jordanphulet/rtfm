const FIRST_CHUNK_DELAY_MS = 1200;
const CHUNK_INTERVAL_MS = 85;
const CHUNK_LENGTH = 20;

export function chunkEnds(body: string): number[] {
  const ends: number[] = [];
  let chunkStart = 0;
  for (const word of body.matchAll(/\S+\s*/g)) {
    const wordEnd = word.index + word[0].length;
    if (wordEnd - chunkStart >= CHUNK_LENGTH) {
      ends.push(wordEnd);
      chunkStart = wordEnd;
    }
  }
  if (ends.at(-1) !== body.length) ends.push(body.length);
  return ends;
}

export function streamBody(
  body: string,
  onProgress: (shownLength: number) => void,
  onDone: () => void,
) {
  const freeze = freezeFromUrl();
  if (freeze !== undefined) {
    onProgress(frozenLength(body, freeze));
    return;
  }
  setTimeout(() => streamChunks(body, onProgress, onDone), FIRST_CHUNK_DELAY_MS);
}

export function streamChunks(
  text: string,
  onProgress: (shownLength: number) => void,
  onDone: () => void,
) {
  const ends = chunkEnds(text);
  let index = 0;
  const sendNextChunk = () => {
    onProgress(ends[index]);
    index += 1;
    if (index < ends.length) setTimeout(sendNextChunk, CHUNK_INTERVAL_MS);
    else onDone();
  };
  sendNextChunk();
}

export function frozenLength(text: string, fraction: number): number {
  return chunkEnds(text).findLast((end) => end <= fraction * text.length) ?? 0;
}

function freezeFromUrl(): number | undefined {
  const freeze = new URLSearchParams(window.location.search).get("freeze");
  return freeze === null ? undefined : Number(freeze);
}
