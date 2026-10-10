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
  const ends = chunkEnds(body);
  const freeze = freezeFromUrl();

  if (freeze !== undefined) {
    onProgress(ends.findLast((end) => end <= freeze * body.length) ?? 0);
    return;
  }

  let index = 0;
  const sendNextChunk = () => {
    onProgress(ends[index]);
    index += 1;
    if (index < ends.length) setTimeout(sendNextChunk, CHUNK_INTERVAL_MS);
    else onDone();
  };
  setTimeout(sendNextChunk, FIRST_CHUNK_DELAY_MS);
}

function freezeFromUrl(): number | undefined {
  const freeze = new URLSearchParams(window.location.search).get("freeze");
  return freeze === null ? undefined : Number(freeze);
}
