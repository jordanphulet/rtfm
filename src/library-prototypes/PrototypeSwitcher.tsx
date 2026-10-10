import { useSyncExternalStore } from "react";
import { Link, useLocation } from "react-router";
import "./prototype-switcher.css";

interface PrototypeSwitcherProps {
  variants: string[];
  current: string;
}

export function PrototypeSwitcher({ variants, current }: PrototypeSwitcherProps) {
  const { search } = useLocation();
  const modalIsOpen = useSyncExternalStore(subscribeToDomChanges, isModalOpen);

  return (
    <nav
      aria-label="Library prototype"
      data-shot="prototype-switcher"
      className="prototype-switcher"
      inert={modalIsOpen}
    >
      {variants.map((variant) => (
        <Link
          key={variant}
          to={{ pathname: `/library/${variant}`, search }}
          reloadDocument
          aria-current={variant === current ? "page" : undefined}
        >
          {variant.toUpperCase()}
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
