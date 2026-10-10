import type { LibraryManual } from "../../library";
import { LedgerRow } from "./LedgerRow";
import "./ledger.css";

interface LedgerProps {
  manuals: LibraryManual[];
  namedIds: Set<string>;
  hoveredId: string | null;
  liftedId: string | null;
  onDelete: (manual: LibraryManual) => void;
  registerRow: (id: string, row: HTMLLIElement | null) => void;
}

export function Ledger({ manuals, namedIds, hoveredId, liftedId, onDelete, registerRow }: LedgerProps) {
  return (
    <section className="ledger" aria-label="Your manuals">
      <div className="ledger-header" aria-hidden="true">
        <span>Manual</span>
        <span>Written</span>
        <span className="ledger-header-opened">Last opened ↓</span>
      </div>
      {manuals.length === 0 ? (
        <div className="ledger-empty">
          <p>
            Your library is empty. Every manual you start is listed here, with how much of it is
            written.
          </p>
        </div>
      ) : (
        <ul className="ledger-rows">
          {manuals.map((manual) => (
            <LedgerRow
              key={manual.id}
              manual={manual}
              named={namedIds.has(manual.id)}
              hovered={hoveredId === manual.id}
              lifted={liftedId === manual.id}
              onDelete={onDelete}
              registerRow={registerRow}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
