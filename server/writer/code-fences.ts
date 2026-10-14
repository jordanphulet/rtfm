const FENCE_OPENING = /^[\s>]*(`{3,}|~{3,}|\${2,}(?!.*\$\$))/;
const FENCE_CLOSING = /^[\s>]*(`{3,}|~{3,})\s*$/;
const FORMULA_CLOSING = /(\${2,})\s*$/;

export function fenceOpenedBy(line: string): string | undefined {
  return line.match(FENCE_OPENING)?.[1];
}

export function closesFence(line: string, openFence: string): boolean {
  const closing = line.match(openFence[0] === "$" ? FORMULA_CLOSING : FENCE_CLOSING)?.[1];
  return closing?.[0] === openFence[0] && closing.length >= openFence.length;
}
