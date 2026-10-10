import { Component, type ReactNode } from "react";

type State = { error: Error | null };

export class PrototypeErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <pre style={{ padding: 16, whiteSpace: "pre-wrap" }}>{String(error)}</pre>;
  }
}
