import { Component, lazy, Suspense, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation, useParams } from "react-router";

const designs = {
  a: lazy(() => import("./designs/a")),
  b: lazy(() => import("./designs/b")),
  c: lazy(() => import("./designs/c")),
};

type DesignKey = keyof typeof designs;

function isDesignKey(value: string | undefined): value is DesignKey {
  return value !== undefined && Object.hasOwn(designs, value);
}

export default function App() {
  return (
    <Routes>
      <Route path="/:design" element={<DesignPage />} />
      <Route path="/:design/:sectionId" element={<DesignPage />} />
      <Route path="*" element={<Navigate to="/a" replace />} />
    </Routes>
  );
}

function DesignPage() {
  const { design, sectionId } = useParams();
  if (!isDesignKey(design)) return <Navigate to="/a" replace />;

  const Design = designs[design];
  return (
    <>
      <DesignErrorBoundary key={design}>
        <Suspense>
          <Design />
        </Suspense>
      </DesignErrorBoundary>
      <DesignSwitcher current={design} sectionId={sectionId} />
    </>
  );
}

type DesignErrorState = { error: Error | null };

class DesignErrorBoundary extends Component<{ children: ReactNode }, DesignErrorState> {
  state: DesignErrorState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) return <pre style={{ padding: 16 }}>{String(this.state.error)}</pre>;
    return this.props.children;
  }
}

function DesignSwitcher({ current, sectionId }: { current: DesignKey; sectionId?: string }) {
  const { search } = useLocation();
  const keys = Object.keys(designs) as DesignKey[];

  return (
    <nav aria-label="Design" data-shot="design-switcher" style={switcherStyle}>
      {keys.map((key) => (
        <Link
          key={key}
          to={{ pathname: sectionId ? `/${key}/${sectionId}` : `/${key}`, search }}
          reloadDocument
          aria-current={key === current ? "page" : undefined}
          style={key === current ? currentLinkStyle : linkStyle}
        >
          {key.toUpperCase()}
        </Link>
      ))}
    </nav>
  );
}

const switcherStyle = {
  position: "fixed",
  right: 8,
  bottom: 8,
  zIndex: 1000,
  display: "flex",
  gap: 2,
  padding: 2,
  background: "#1e1e1e",
  font: "11px/1 ui-monospace, monospace",
  opacity: 0.7,
} as const;

const linkStyle = {
  padding: "4px 6px",
  color: "#9a9a9a",
  textDecoration: "none",
} as const;

const currentLinkStyle = {
  ...linkStyle,
  color: "#ececec",
  background: "#333",
} as const;
