import AkayLogoLoader from "./AkayLogoLoader";

export default function AkayLoadingCard({
  message = "Loading...",
  variant = "fetch",
  size = "lg",
  className = "",
}) {
  return (
    <div
      className={`inline-flex flex-col items-center justify-center rounded-2xl border border-[#E8ECF0]/90 bg-white px-6 py-5 text-center shadow-lg shadow-slate-900/[0.07] ${className}`}
    >
      <AkayLogoLoader label={message} size={size} variant={variant} />
    </div>
  );
}
