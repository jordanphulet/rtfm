import { Component, type ReactNode } from "react";
import "../ui";
import { Wordmark } from "./Wordmark";
import "./tokens.css";
import "./page.css";
import "./LibraryHead.css";
import "./Ledger.css";
import "./LibraryErrorBoundary.css";

export class LibraryErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="ui home">
        <div className="page">
          <main className="library">
            <div className="library-inner">
              <header className="library-head">
                <Wordmark />
              </header>
              <section className="ledger ledger-empty" aria-labelledby="library-error-title">
                <h2 id="library-error-title" className="library-error-title">
                  Couldn’t open your library
                </h2>
                <p>
                  Your manuals didn’t load, so there’s nothing to show yet.{" "}
                  <button type="button" className="link empty-link" onClick={() => window.location.reload()}>
                    Try again
                  </button>
                  .
                </p>
              </section>
            </div>
          </main>
        </div>
      </div>
    );
  }
}
