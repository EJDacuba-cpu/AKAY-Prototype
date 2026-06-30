import AkayLogoLoader from "./AkayLogoLoader";

export default function InlineSpinner({ label = "Loading...", className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-[12px] font-medium text-slate-500 ${className}`}
    >
      <AkayLogoLoader label={label} size="sm" showLabel={false} />
      {label}
    </span>
  );
}
