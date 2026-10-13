/** Exits once standard output has taken every line: a pipe may still be holding some. */
export function exitOnceWritten(code: number) {
  process.stdout.write("", () => process.exit(code));
}
