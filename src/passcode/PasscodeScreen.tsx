import { useEffect, useRef, useState, type FormEvent } from "react";
import "../ui";
import { enterPasscode } from "./api";
import "./PasscodeScreen.css";

type Status = "ready" | "checking" | "wrong" | "unanswered";

const FINE_POINTER = "(hover: hover) and (pointer: fine)";

/**
 * One field for the server's passcode; once it is accepted, the page reloads where it was. With
 * `linkClosed`, a line above it says why a library's link no longer opens it.
 */
export function PasscodeScreen({ linkClosed = false }: { linkClosed?: boolean }) {
  const [passcode, setPasscode] = useState("");
  const [status, setStatus] = useState<Status>("ready");
  const field = useRef<HTMLInputElement>(null);
  const canOpen = passcode !== "" && status !== "checking";

  useEffect(() => {
    if (window.matchMedia(FINE_POINTER).matches) field.current?.focus();
  }, []);

  async function open(event: FormEvent) {
    event.preventDefault();
    if (!canOpen) return;
    setStatus("checking");
    const answer = await enterPasscode(passcode);
    if (answer === "accepted") {
      window.location.reload();
      return;
    }
    setStatus(answer);
    field.current?.focus();
    field.current?.select();
  }

  return (
    <div className="ui passcode">
      <main className="passcode-page">
        <div className="passcode-inner">
          {linkClosed && (
            <p id="passcode-closed" className="passcode-closed">
              This link is closed.
            </p>
          )}
          <h1 className="passcode-title">This library is private</h1>
          <p className="passcode-lead">Enter its passcode to open it.</p>
          <form onSubmit={open}>
            <label className="passcode-label" htmlFor="passcode-field">
              Passcode
            </label>
            <div className="passcode-row">
              <input
                ref={field}
                id="passcode-field"
                className="passcode-field"
                type="password"
                name="passcode"
                autoComplete="current-password"
                aria-describedby={linkClosed ? "passcode-closed passcode-status" : "passcode-status"}
                data-shot="passcode-input"
                value={passcode}
                onChange={(event) => setPasscode(event.target.value)}
              />
              <button type="submit" className="passcode-open" aria-disabled={!canOpen || undefined}>
                {status === "checking" ? "Checking…" : "Open"}
              </button>
            </div>
            <p id="passcode-status" className="passcode-status" role="status">
              <StatusMessage status={status} />
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}

function StatusMessage({ status }: { status: Status }) {
  if (status === "wrong") {
    return (
      <>
        <strong>Wrong passcode.</strong> Check it and try again.
      </>
    );
  }
  if (status === "unanswered") {
    return (
      <>
        <strong>Couldn’t check the passcode.</strong> The server didn’t answer. Try again in a moment.
      </>
    );
  }
  return null;
}
