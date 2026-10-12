const FENCE_OPENING = /^[\s>]*(`{3,}|~{3,})/;
const FENCE_CLOSING = /^[\s>]*(`{3,}|~{3,})\s*$/;

export function fenceOpenedBy(line: string): string | undefined {
  return line.match(FENCE_OPENING)?.[1];
}

export function closesFence(line: string, openFence: string): boolean {
  const closing = line.match(FENCE_CLOSING)?.[1];
  return closing?.[0] === openFence[0] && closing.length >= openFence.length;
}
