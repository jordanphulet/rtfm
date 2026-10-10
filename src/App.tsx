import { Component, lazy, Suspense, useSyncExternalStore, type ReactNode } from "react";
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
  const modalIsOpen = useSyncExternalStore(subscribeToDomChanges, isModalOpen);
  const keys = Object.keys(designs) as DesignKey[];

  return (
    <nav aria-label="Design" data-shot="design-switcher" className="design-switcher" inert={modalIsOpen}>
      <style>{switcherCss}</style>
      {keys.map((key) => (
        <Link
          key={key}
          to={{ pathname: sectionId ? `/${key}/${sectionId}` : `/${key}`, search }}
          reloadDocument
          aria-current={key === current ? "page" : undefined}
        >
          {key.toUpperCase()}
        </Link>
      ))}
    </nav>
  );
}

function isModalOpen() {
  const modals = document.querySelectorAll("dialog:modal, [aria-modal='true']");
  return [...modals].some((modal) => !modal.closest("[inert]"));
}

function subscribeToDomChanges(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["open", "inert", "aria-modal"],
  });
  return () => observer.disconnect();
}

const switcherCss = `
  .design-switcher {
    position: fixed;
    top: 50%;
    right: 2px;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 1px;
    background: #1e1e1e;
    font: 11px/1 ui-monospace, monospace;
    opacity: 0.7;
    transform: translateY(-50%);
  }
  .design-switcher:hover,
  .design-switcher:focus-within {
    opacity: 1;
  }
  .design-switcher a {
    padding: 4px 2px;
    color: #9a9a9a;
    text-decoration: none;
  }
  .design-switcher a[aria-current="page"] {
    color: #ececec;
    background: #333;
  }
`;
