import { useEffect, useRef, type MouseEvent } from "react";
import { Contents } from "./Contents";

interface ContentsSheetProps {
  isOpen: boolean;
  currentId?: string;
  onClose: () => void;
}

export function ContentsSheet({ isOpen, currentId, onClose }: ContentsSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
      const current = dialog.querySelector<HTMLElement>("[aria-current=page]");
      current?.closest(".chapter-entry")?.scrollIntoView({ block: "start" });
      current?.focus({ preventScroll: true });
    }
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="contents-sheet"
      aria-labelledby="contents-sheet-title"
      onClose={onClose}
      onClick={closeOnBackdrop}
    >
      <div className="sheet-paper">
        <header className="sheet-head">
          <h2 id="contents-sheet-title" className="caps">Contents</h2>
          <button type="button" className="sheet-close" onClick={onClose}>
            Close <span className="sheet-key">Esc</span>
          </button>
        </header>
        <Contents variant="sheet" markedId={currentId} markIsCurrentPage onChoose={onClose} />
      </div>
    </dialog>
  );
}
