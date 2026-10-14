import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { requirePasscode } from "../passcode";
import "../ui";
import { openLibrary } from "./api";
import { Opening } from "./Opening";
import "./LinkPage.css";

/**
 * `/l#<secret>`: takes the secret out of the address, posts it, and opens the library at `/`. A
 * closed link shows the passcode screen, saying so.
 */
export function LinkPage() {
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const [secret] = useState(() => hash.slice(1));
  const [attempt, setAttempt] = useState(0);
  const [unanswered, setUnanswered] = useState(false);

  useEffect(() => {
    if (hash) navigate(pathname, { replace: true });
  }, [hash, pathname, navigate]);

  useEffect(() => {
    let current = true;
    void openLibrary(secret).then((answer) => {
      if (!current) return;
      if (answer === "unanswered") {
        setUnanswered(true);
        return;
      }
      if (answer === "closed") requirePasscode("link-closed");
      navigate("/", { replace: true });
    });
    return () => {
      current = false;
    };
  }, [secret, attempt, navigate]);

  if (!unanswered) return <Opening />;
  return (
    <Unanswered
      onRetry={() => {
        setUnanswered(false);
        setAttempt((count) => count + 1);
      }}
    />
  );
}

function Unanswered({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="ui library-link">
      <main className="link-page">
        <div className="link-inner">
          <h1 className="link-title">Couldn’t open your library</h1>
          <p className="link-lead">
            Your library didn’t open, so there’s nothing to show yet.{" "}
            <button type="button" className="link link-retry" onClick={onRetry}>
              Try again
            </button>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
