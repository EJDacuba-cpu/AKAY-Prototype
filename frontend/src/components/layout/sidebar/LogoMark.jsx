import { LOGO_SRC, LOGO_WORDMARK_SRC } from "./sidebarData";

export default function LogoMark({ size = "md" }) {
  const boxSize = size === "sm" ? "h-8 w-8" : "h-9 w-9";

  return (
    <div className={`flex ${boxSize} shrink-0 items-center justify-center`}>
      <img
        src={LOGO_SRC}
        alt="AKAY Logo"
        className="h-full w-full object-contain"
        draggable="false"
      />
    </div>
  );
}

export function LogoWordmark({ className = "h-[18px]" }) {
  return (
    <img
      src={LOGO_WORDMARK_SRC}
      alt="AKAY"
      className={`w-auto max-w-full object-contain object-left ${className}`}
      draggable="false"
    />
  );
}
