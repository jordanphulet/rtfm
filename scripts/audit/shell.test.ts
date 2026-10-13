import { describe, expect, it } from "vitest";
import { simpleCommands } from "./shell.ts";

describe("simpleCommands", () => {
  it("splits at operators, pipes and newlines, and lists a substitution's commands apart", () => {
    expect(simpleCommands("cd src && git status; ls | wc -l\nkill $(lsof -ti :5999)")).toEqual([
      ["cd", "src"],
      ["git", "status"],
      ["ls"],
      ["wc", "-l"],
      ["kill", "$(…)"],
      ["lsof", "-ti", ":5999"],
    ]);
  });

  it("keeps a command whole around a substitution in its middle", () => {
    expect(simpleCommands("git -C $(pwd) commit -m x")).toEqual([
      ["git", "-C", "$(…)", "commit", "-m", "x"],
      ["pwd"],
    ]);
    expect(simpleCommands("kill `cat /tmp/example.pid`")).toEqual([["kill", "$(…)"], ["cat", "/tmp/example.pid"]]);
  });

  it("never splits inside quotes, and unquotes words", () => {
    expect(simpleCommands(`grep -n "a; git commit" 'b && pkill x' file`)).toEqual([
      ["grep", "-n", "a; git commit", "b && pkill x", "file"],
    ]);
  });

  it("leaves out heredoc bodies", () => {
    const script = ["cat > notes.md <<'EOF'", "git commit -am done", "pkill -f example-server", "EOF", "git status"].join("\n");
    expect(simpleCommands(script)).toEqual([["cat", ">", "notes.md", "<<", "EOF"], ["git", "status"]]);
  });

  it("reads a heredoc inside a quoted substitution as text", () => {
    const script = ['git commit -F - "$(cat <<\'EOF\'', "rm -r .data/example", "EOF", ')"'].join("\n");
    expect(simpleCommands(script).map((words) => words[0])).toEqual(["git", "cat"]);
  });

  it("doesn't take a here-string, an arithmetic shift or a quoted << for a heredoc", () => {
    expect(simpleCommands("grep x <<< 'text'\ngit push").at(-1)).toEqual(["git", "push"]);
    expect(simpleCommands("echo $((1<<3))\ngit push").at(-1)).toEqual(["git", "push"]);
    expect(simpleCommands("echo 'a <<EOF b'\ngit push").at(-1)).toEqual(["git", "push"]);
  });

  it("leaves out comments", () => {
    expect(simpleCommands("# pkill -f example-server\nls # git push")).toEqual([["ls"]]);
  });

  it("drops variable assignments, shell keywords and wrappers before the command", () => {
    expect(simpleCommands("FOO=1 sudo -u me env BAR=2 git push")).toEqual([["git", "push"]]);
    expect(simpleCommands("lsof -ti :5999 | xargs -I {} kill {}")).toEqual([["lsof", "-ti", ":5999"], ["kill", "{}"]]);
    expect(simpleCommands("if true; then git commit -m x; fi")).toContainEqual(["git", "commit", "-m", "x"]);
    expect(simpleCommands("for f in a b; do git rm $f; done")).toContainEqual(["git", "rm", "$f"]);
    expect(simpleCommands("for p in 1 2; do kill $p; done")).toContainEqual(["kill", "$p"]);
    expect(simpleCommands("{ git push; }")).toContainEqual(["git", "push"]);
    expect(simpleCommands("! git push")).toEqual([["git", "push"]]);
    expect(simpleCommands("timeout 30 git push")).toEqual([["git", "push"]]);
    expect(simpleCommands("timeout -s KILL 30s pkill -f example-server")).toEqual([["pkill", "-f", "example-server"]]);
  });

  it("reads the script given to sh -c, bash -c or zsh -c", () => {
    expect(simpleCommands("bash -c 'cd /tmp && git push'")).toEqual([["cd", "/tmp"], ["git", "push"]]);
    expect(simpleCommands('zsh -lc "pkill -f example-server"')).toEqual([["pkill", "-f", "example-server"]]);
  });

  it("keeps redirections as words of their own", () => {
    expect(simpleCommands("echo hi > notes.md 2>&1")).toEqual([["echo", "hi", ">", "notes.md", ">&1"]]);
  });
});
