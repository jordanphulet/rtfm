/** One simple command's words, unquoted, with leading assignments, keywords and wrappers removed. */
export type SimpleCommand = string[];

/** The word that stands for a command substitution's output, whose commands are listed apart. */
export const SUBSTITUTION = "$(…)";

const KEYWORDS = new Set(["if", "then", "else", "elif", "while", "until", "do", "!", "{"]);
const WRAPPERS = new Set(["sudo", "command", "time", "nohup", "exec", "env", "xargs", "nice"]);
const WRAPPER_OPTIONS_WITH_VALUE = new Set(["-I", "-n", "-P", "-L", "-d", "-s", "-E", "-u", "-k"]);
const SHELLS = new Set(["sh", "bash", "zsh"]);
const SEPARATORS = new Set([";", "&", "|", "\n", "(", ")"]);

// A heredoc's start, outside quotes and arithmetic: `<<EOF`, `<<-EOF`, `<<'EOF'`, but not the
// here-string `<<<` or a shift such as `$((1<<3))`. Quoted strings and arithmetic are matched first
// so the `<<` inside them is passed over.
const HEREDOC_START = /'[^']*'|"(?:\\.|[^"\\])*"|\(\([^)]*\)\)|(?<!<)<<(?!<)-?\s*(['"]?)([\w.-]+)\1/g;

/**
 * The simple commands in a shell script, as a reader would pick them out: split at `;`, `&&`,
 * `||`, pipes, newlines and subshells, never inside quotes, with comments and heredoc bodies left
 * out. A command substitution's commands are listed after the command they are in, and the
 * script given to `sh -c`, `bash -c` or `zsh -c` is read as commands too.
 */
export function simpleCommands(script: string): SimpleCommand[] {
  return tokenize(withoutHeredocBodies(script)).flatMap(commandsOf);
}

/** `script` without the lines of any heredoc body, which are text, not commands. */
export function withoutHeredocBodies(script: string): string {
  const kept: string[] = [];
  const pending: string[] = [];
  for (const line of script.split("\n")) {
    if (pending.length > 0) {
      if (line.trim() === pending[0]) pending.shift();
      continue;
    }
    kept.push(line);
    for (const match of line.matchAll(HEREDOC_START)) {
      if (match[2]) pending.push(match[2]);
    }
  }
  return kept.join("\n");
}

function tokenize(script: string): string[][] {
  const commands: string[][] = [[]];
  const substituted: string[][] = [];
  let word: string | undefined;
  let inDoubleQuotes = false;
  const append = (text: string) => {
    word = (word ?? "") + text;
  };
  const endWord = () => {
    if (word !== undefined) commands.at(-1)!.push(word);
    word = undefined;
  };
  const substitute = (end: number, inner: string) => {
    substituted.push(...tokenize(inner));
    append(SUBSTITUTION);
    return end;
  };
  // `open` is the index of the `(` after `$`; returns the index of the substitution's last character.
  const dollarParen = (open: number) => {
    const close = closingParen(script, open);
    if (script[open + 1] === "(") {
      append("$((…))");
      return close;
    }
    return substitute(close, script.slice(open + 1, close));
  };
  const backtick = (open: number) => {
    const close = indexOrEnd(script, "`", open + 1);
    return substitute(close, script.slice(open + 1, close));
  };

  for (let i = 0; i < script.length; i++) {
    const char = script[i];
    if (inDoubleQuotes) {
      if (char === '"') inDoubleQuotes = false;
      else if (char === "\\" && /["\\$`]/.test(script[i + 1] ?? "")) append(script[++i]);
      else if (char === "$" && script[i + 1] === "(") i = dollarParen(i + 1);
      else if (char === "`") i = backtick(i);
      else append(char);
    } else if (char === '"') {
      inDoubleQuotes = true;
      append("");
    } else if (char === "'") {
      const close = indexOrEnd(script, "'", i + 1);
      append(script.slice(i + 1, close));
      i = close;
    } else if (char === "\\") {
      append(script[++i] ?? "");
    } else if (char === "#" && word === undefined) {
      i = indexOrEnd(script, "\n", i) - 1;
    } else if (char === "$" && script[i + 1] === "(") {
      i = dollarParen(i + 1);
    } else if (char === "`") {
      i = backtick(i);
    } else if (SEPARATORS.has(char)) {
      endWord();
      commands.push([]);
    } else if (char === ">" || char === "<") {
      if (word !== undefined && /^\d+$/.test(word)) word = undefined;
      endWord();
      const operator = /^[<>]+(?:&[\d-]*)?/.exec(script.slice(i))![0];
      commands.at(-1)!.push(operator);
      i += operator.length - 1;
    } else if (/\s/.test(char)) {
      endWord();
    } else {
      append(char);
    }
  }
  endWord();
  return [...commands, ...substituted];
}

function closingParen(script: string, open: number): number {
  let depth = 0;
  for (let i = open; i < script.length; i++) {
    const char = script[i];
    if (char === "'") i = indexOrEnd(script, "'", i + 1);
    else if (char === "\\") i++;
    else if (char === "(") depth++;
    else if (char === ")" && --depth === 0) return i;
  }
  return script.length;
}

function indexOrEnd(script: string, text: string, from: number): number {
  const index = script.indexOf(text, from);
  return index === -1 ? script.length : index;
}

/** The files a command's output is redirected to, as in `> file` or `>> file`. */
export function redirectTargets(command: SimpleCommand): string[] {
  return command.flatMap((word, index) => (word.startsWith(">") && !word.startsWith(">&") ? [command[index + 1] ?? ""] : []));
}

function commandsOf(words: string[]): SimpleCommand[] {
  const command = withoutPrefixes(words);
  if (command.length === 0) return [];
  const scriptFlag = command.findIndex((word, index) => index > 0 && /^-[a-z]*c[a-z]*$/.test(word));
  if (SHELLS.has(command[0]) && scriptFlag !== -1 && command[scriptFlag + 1] !== undefined) {
    return simpleCommands(command[scriptFlag + 1]);
  }
  return [command];
}

// `command -v name` only looks the name up, so it stays a command of its own.
function withoutPrefixes(words: string[]): string[] {
  let i = 0;
  while (i < words.length) {
    if (words[i] === "command" && /^-[vV]$/.test(words[i + 1] ?? "")) {
      break;
    } else if (/^[A-Za-z_]\w*=/.test(words[i]) || KEYWORDS.has(words[i])) {
      i++;
    } else if (WRAPPERS.has(words[i]) || words[i] === "timeout") {
      const isTimeout = words[i] === "timeout";
      i++;
      while (words[i]?.startsWith("-")) i += WRAPPER_OPTIONS_WITH_VALUE.has(words[i]) ? 2 : 1;
      if (isTimeout) i++;
    } else {
      break;
    }
  }
  return words.slice(i);
}
