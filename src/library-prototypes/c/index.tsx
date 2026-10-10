import { useRef } from "react";
import { useAgent } from "../../agent";
import { useLibrary } from "../../library";
import "../../ui";
import { Conversation } from "./Conversation";
import { DeleteConfirmation } from "./DeleteConfirmation";
import { AGENT_INPUT_ID, Dock } from "./Dock";
import { toExchanges } from "./exchanges";
import { LibraryPlate } from "./LibraryPlate";
import { MarginIndex } from "./MarginIndex";
import { Suggestions } from "./Suggestions";
import { useDeleteFlow } from "./useDeleteFlow";
import { useInView } from "./useInView";
import { usePageMeasures } from "./usePageMeasures";
import { usePrompt } from "./usePrompt";
import { useReplyAnnouncement } from "./useReplyAnnouncement";
import { useSlashShortcut } from "./useSlashShortcut";
import "./tokens.css";
import "./layout.css";

export default function Library() {
  const { messages, status, send } = useAgent();
  const manuals = useLibrary();
  const exchanges = toExchanges(messages);
  const prompt = usePrompt();
  const deletion = useDeleteFlow(manuals, exchanges.length);
  const replyAnnouncement = useReplyAnnouncement(exchanges, status);

  const rootRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const plateHeadRef = useRef<HTMLElement>(null);
  const plateHeadInView = useInView(plateHeadRef);
  usePageMeasures(rootRef, dockRef);
  useSlashShortcut(prompt.focusInput, deletion.confirming === null);

  function sendSuggestion(text: string) {
    send(text);
    prompt.focusInput();
  }

  return (
    <div className="ui library-c" ref={rootRef}>
      <div className="page" inert={deletion.confirming !== null}>
        <a
          className="skip-link"
          href={`#${AGENT_INPUT_ID}`}
          onClick={(event) => {
            event.preventDefault();
            prompt.focusInput();
          }}
        >
          Skip to the librarian
        </a>
        <div className="page-grid layout">
          <main className="script">
            <LibraryPlate
              manuals={manuals}
              confirmingId={deletion.confirming?.id ?? null}
              leavingId={deletion.leavingId}
              headRef={plateHeadRef}
              onDelete={deletion.request}
              onStartNew={prompt.startNewManual}
            />
            <Conversation
              exchanges={exchanges}
              status={status}
              suggestions={
                <Suggestions placement="script" onSend={sendSuggestion} onStartNew={prompt.startNewManual} />
              }
            />
          </main>
          <MarginIndex exchanges={exchanges} status={status} manualCount={manuals.length} />
        </div>
        <Dock
          dockRef={dockRef}
          prompt={prompt}
          status={status}
          send={send}
          onSuggestion={sendSuggestion}
          conversationEmpty={exchanges.length === 0}
          libraryInView={plateHeadInView}
        />
      </div>
      <DeleteConfirmation manual={deletion.confirming} onKeep={deletion.keep} onConfirm={deletion.confirm} />
      <p className="visually-hidden" aria-live="polite">
        {replyAnnouncement}
      </p>
      <p className="visually-hidden" aria-live="polite">
        {deletion.announcement}
      </p>
    </div>
  );
}
