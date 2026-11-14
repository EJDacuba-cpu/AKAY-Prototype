import "./care-tracking.css";

export default function ProfileCardsSkeleton({ label = "Loading care tracking" }) {
  return (
    <div role="status" aria-label={label} className="care-tracking-grid">
      <span className="sr-only">{label}...</span>
      {[0, 1, 2].map((key) => (
        <div key={key} className="care-tracking-skeleton" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((line) => <span key={line} className="care-tracking-skeleton__line" />)}
        </div>
      ))}
    </div>
  );
}
