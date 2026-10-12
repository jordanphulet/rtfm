/** Escapes `<`, so text inserted in a prompt can't open or close a tag. */
export function escapeTags(text: string): string {
  return text.replaceAll("<", "&lt;");
}
