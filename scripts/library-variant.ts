const LIBRARY_VARIANTS = ["a", "b", "c"] as const;

export type LibraryVariant = (typeof LIBRARY_VARIANTS)[number];

function isLibraryVariant(value: string | undefined): value is LibraryVariant {
  return LIBRARY_VARIANTS.some((variant) => variant === value);
}

export function libraryVariantFromArgs(command: string): LibraryVariant {
  const variant = process.argv[2];
  if (isLibraryVariant(variant)) return variant;

  console.error(`Usage: npm run ${command} -- <${LIBRARY_VARIANTS.join("|")}>`);
  process.exit(1);
}
