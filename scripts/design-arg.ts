export const DESIGNS = ["a", "b", "c"] as const;

export type Design = (typeof DESIGNS)[number];

function isDesign(value: string | undefined): value is Design {
  return DESIGNS.some((design) => design === value);
}

export function designFromArgs(command: string): Design {
  const design = process.argv[2];
  if (isDesign(design)) return design;

  console.error(`Usage: npm run ${command} -- <${DESIGNS.join("|")}>`);
  process.exit(1);
}
