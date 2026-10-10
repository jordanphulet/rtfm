import type { AgentStatus } from "../agent";
import { StatusRing } from "../ui";
import "./librarian-head.css";

interface LibrarianStatusProps {
  messageCount: number;
  status: AgentStatus;
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

export function StatusDetail({ messageCount, status }: LibrarianStatusProps) {
  if (status !== "idle") {
    return (
      <span className="status-detail" data-live="">
        <Separator />
        <StatusRing status="writing" />
        {status === "thinking" ? "Thinking…" : "Replying…"}
      </span>
    );
  }
  return (
    <span className="status-detail">
      <Separator />
      {describeCount(messageCount)}
    </span>
  );
}

export function Separator() {
  return <span aria-hidden="true">·</span>;
}

function describeCount(messageCount: number): string {
  if (messageCount === 0) return "Try asking";
  return messageCount === 1 ? "1 message" : `${messageCount} messages`;
}
