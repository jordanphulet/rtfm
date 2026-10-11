import "../ui";
import "./failure-notice.css";

interface FailureNoticeProps {
  title: string;
  lead: string;
  afterRetry: string;
  onRetry: () => void;
}

export function FailureNotice({ title, lead, afterRetry, onRetry }: FailureNoticeProps) {
  return (
    <div className="failure-notice">
      <p className="failure-title">{title}</p>
      <p>
        {lead}{" "}
        <button type="button" className="link failure-retry" onClick={onRetry}>
          Try again
        </button>
        {afterRetry}
      </p>
    </div>
  );
}
