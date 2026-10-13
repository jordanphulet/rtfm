import "./NewestButton.css";

interface NewestButtonProps {
  replying: boolean;
  onJump: () => void;
  className?: string;
}

export function NewestButton({ replying, onJump, className }: NewestButtonProps) {
  return (
    <button
      type="button"
      className={className ? `text-button newest ${className}` : "text-button newest"}
      onClick={onJump}
    >
      {replying && <span className="write-head-lamp" aria-hidden="true" />}
      {replying ? "Replying ↓" : "Newest ↓"}
    </button>
  );
}
