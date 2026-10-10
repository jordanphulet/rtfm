import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useAgent } from "../../agent";
import { deleteManual, formatLastOpened, useLibrary, type LibraryManual } from "../../library";
import { ReplyMarkdown, Sheet } from "../../ui";
import "./library.css";

export default function Library() {
  const [toDelete, setToDelete] = useState<LibraryManual | null>(null);

  return (
    <div className="ui library-a">
      <main inert={toDelete !== null}>
        <h1>Library</h1>
        <Conversation />
        <Manuals onDelete={setToDelete} />
      </main>
      <DeleteConfirmation manual={toDelete} onClose={() => setToDelete(null)} />
    </div>
  );
}

function Conversation() {
  const { messages, status, send } = useAgent();
  const [draft, setDraft] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (status !== "idle") return;
    send(draft);
    setDraft("");
  }

  return (
    <section aria-label="Conversation">
      {messages.map((message, index) => (
        <article key={message.id}>
          <strong>{message.role === "user" ? "You" : "Librarian"}</strong>
          {message.role === "user" ? (
            <p>{message.text}</p>
          ) : (
            <ReplyMarkdown>{message.text}</ReplyMarkdown>
          )}
          {status === "streaming" && index === messages.length - 1 && <span>▍</span>}
        </article>
      ))}
      {status === "thinking" && <p>Thinking…</p>}
      <form onSubmit={submit}>
        <input
          data-shot="agent-input"
          aria-label="Ask the librarian"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={status !== "idle"}>
          Send
        </button>
      </form>
    </section>
  );
}

function Manuals({ onDelete }: { onDelete: (manual: LibraryManual) => void }) {
  const manuals = useLibrary();
  if (manuals.length === 0) return <p>No manuals.</p>;

  return (
    <ul>
      {manuals.map((manual) => (
        <li key={manual.id}>
          <Link to="/read" className="link">
            {manual.title}
          </Link>
          <p>{manual.subtitle}</p>
          <p>
            {manual.writtenCount} of {manual.sectionCount} sections written · opened{" "}
            {formatLastOpened(manual.lastOpenedAt)}
          </p>
          <button type="button" data-shot="delete" onClick={() => onDelete(manual)}>
            Delete<span className="visually-hidden"> {manual.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

interface DeleteConfirmationProps {
  manual: LibraryManual | null;
  onClose: () => void;
}

function DeleteConfirmation({ manual, onClose }: DeleteConfirmationProps) {
  function confirm() {
    if (manual) deleteManual(manual.id);
    onClose();
  }

  return (
    <Sheet
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-title"
      open={manual !== null}
      onClose={onClose}
      className="confirm"
    >
      <h2 id="delete-title">Delete {manual?.title}?</h2>
      <button type="button" onClick={onClose}>
        Keep it
      </button>
      <button type="button" onClick={confirm}>
        Delete
      </button>
    </Sheet>
  );
}
