const CODE_FENCE = /^[\s>]*(`{3,}|~{3,})/;
const FORMULA_OPENING = /^([\s>]*)(\${2,})(?!.*\$\$)(.*)$/;
const FORMULA_CLOSING = /^([\s>]*)(.*?)\s*(\${2,})\s*$/;

/**
 * Puts the `$$` lines of a formula block on lines of their own, as remark-math needs them:
 * `$$ f = ma` would make the formula a label, and `f = ma $$` would never close the block.
 */
export function separateFormulaFences(markdown: string): string {
  let codeFence: string | undefined;
  let formulaFence: string | undefined;
  return markdown
    .split("\n")
    .flatMap((line) => {
      if (codeFence !== undefined) {
        if (closesCodeFence(line, codeFence)) codeFence = undefined;
        return [line];
      }
      if (formulaFence !== undefined) {
        const [, prefix = "", latex = "", marker = ""] = line.match(FORMULA_CLOSING) ?? [];
        if (marker.length < formulaFence.length) return [line];
        formulaFence = undefined;
        return latex === "" ? [line] : [prefix + latex, prefix + marker];
      }
      const opening = line.match(FORMULA_OPENING);
      if (opening) {
        const [, prefix = "", marker = "", rest = ""] = opening;
        formulaFence = marker;
        const latex = rest.trim();
        return latex === "" ? [line] : [prefix + marker, prefix + latex];
      }
      codeFence = line.match(CODE_FENCE)?.[1];
      return [line];
    })
    .join("\n");
}

function closesCodeFence(line: string, fence: string): boolean {
  const closing = line.trim().replace(/^[>\s]*/, "");
  return closing[0] === fence[0] && /^(`+|~+)$/.test(closing) && closing.length >= fence.length;
}
