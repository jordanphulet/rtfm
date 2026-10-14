import type { LibrarianStatus } from "../librarian";
import { StatusRing } from "../ui";
import "./LibrarianHead.css";

interface LibrarianStatusProps {
  isEmpty: boolean;
  status: LibrarianStatus;
  activity: string;
}

export function LibrarianHead({ edge, ...detail }: LibrarianStatusProps & { edge: boolean }) {
  return (
    <header className="librarian-head" data-edge={edge || undefined}>
      <h2 id="librarian-title" className="librarian-name">
        Librarian
      </h2>
      <StatusDetail {...detail} />
    </header>
  );
}

export function StatusDetail({ isEmpty, status, activity }: LibrarianStatusProps) {
  if (status !== "idle") {
    return (
      <span className="status-detail" data-live="">
        <Separator />
        <StatusRing status="writing" />
        <span className="status-text">{describeActivity(status, activity)}</span>
      </span>
    );
  }
  if (!isEmpty) return null;
  return (
    <span className="status-detail">
      <Separator />
      Try asking
    </span>
  );
}

export function describeActivity(status: Exclude<LibrarianStatus, "idle">, activity: string): string {
  return status === "thinking" ? activity : "Replying…";
}

export function Separator() {
  return <span aria-hidden="true">·</span>;
}
