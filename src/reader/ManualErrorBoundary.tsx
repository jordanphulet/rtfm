import { Component, type ReactNode } from "react";
import "../ui";
import { FailureNotice } from "./FailureNotice";
import "./tokens.css";
import "./manual-error-boundary.css";

interface ManualErrorBoundaryProps {
  resetKey: string;
  children: ReactNode;
}

export class ManualErrorBoundary extends Component<ManualErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previous: ManualErrorBoundaryProps) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="ui reader">
        <main className="manual-error">
          <div className="column">
            <FailureNotice
              title="Couldn’t open this manual"
              lead="The manual didn’t load, so there’s nothing to show yet."
              afterRetry="."
              onRetry={() => window.location.reload()}
            />
          </div>
        </main>
      </div>
    );
  }
}
