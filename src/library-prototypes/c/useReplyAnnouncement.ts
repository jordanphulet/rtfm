import { useEffect, useRef, useState } from "react";
import type { AgentStatus } from "../../agent";
import type { ExchangeData } from "./exchanges";

export function useReplyAnnouncement(exchanges: ExchangeData[], status: AgentStatus): string {
  const [announcement, setAnnouncement] = useState("");
  const previousStatus = useRef(status);
  const lastReply = exchanges.at(-1)?.reply?.text ?? "";

  useEffect(() => {
    const previous = previousStatus.current;
    previousStatus.current = status;
    if (status === "thinking" && previous === "idle") setAnnouncement("The librarian is thinking.");
    if (status === "idle" && previous === "streaming") setAnnouncement(withoutMarkdown(lastReply));
  }, [status, lastReply]);

  return announcement;
}

function withoutMarkdown(text: string): string {
  return text.replaceAll(/[*_`]/g, "");
}
