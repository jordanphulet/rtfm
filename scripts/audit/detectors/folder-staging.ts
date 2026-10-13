import path from "node:path";
import type { Event } from "../events.ts";
import { gitSubcommand } from "../git-commands.ts";
import type { SimpleCommand } from "../shell.ts";
import { bashCommands, joinCommands, scriptCandidate, type Candidate } from "./candidate.ts";

/** Whether a path is a folder: true or false when it can tell, undefined when it can't. */
export type IsDirectory = (file: string) => boolean | undefined;

/**
 * The orchestrator (a session, not a subagent) staging or committing whole folders: `git add` with
 * `-A`, `--all`, `-u`, `--update`, `.` or a folder, and `git commit -a`. A path is a folder when
 * `isDirectory` says so, resolved against the event's working folder; when it can't tell, a path
 * that ends in `/` or whose last part has no `.`.
 */
export function folderStaging(events: Event[], isDirectory: IsDirectory = () => undefined): Candidate[] {
  return events
    .filter((event) => event.agent === undefined)
    .flatMap((event) => {
      const isFolder = (arg: string) =>
        isDirectory(path.resolve(event.cwd ?? "", arg)) ?? (arg.endsWith("/") || !arg.split("/").at(-1)!.includes("."));
      const staging = bashCommands(event).filter((command) => stagesFolder(command, isFolder));
      if (staging.length === 0) return [];
      return [scriptCandidate(event, joinCommands(staging))];
    });
}

function stagesFolder(command: SimpleCommand, isFolder: (arg: string) => boolean): boolean {
  const subcommand = gitSubcommand(command);
  if (subcommand?.name === "commit") {
    return subcommand.args.some((arg) => arg === "--all" || /^-[a-zA-Z]*a[a-zA-Z]*$/.test(arg));
  }
  if (subcommand?.name !== "add") return false;
  return subcommand.args.some(
    (arg) => ["-A", "--all", "-u", "--update", "."].includes(arg) || (!arg.startsWith("-") && isFolder(arg)),
  );
}
