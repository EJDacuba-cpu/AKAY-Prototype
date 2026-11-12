export default function AkayWordmark({ compact = false, className = "" }) {
  return (
    <span
      className={`inline-block font-sans font-extrabold leading-none tracking-[-0.06em] text-[#B91C1C] ${className}`}
      aria-label="AKAY"
    >
      {compact ? "A" : "AKAY"}
    </span>
  );
}
