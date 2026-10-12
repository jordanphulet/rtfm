import type { Section } from "../manual";
import { STATUS_WORDS } from "./statusWords";

export function HiddenStatusWord({ status }: { status: Section["status"] }) {
  return <span className="visually-hidden">, {STATUS_WORDS[status].toLowerCase()}</span>;
}
