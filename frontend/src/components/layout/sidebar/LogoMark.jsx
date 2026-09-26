import { LOGO_SRC } from "./sidebarData";

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
