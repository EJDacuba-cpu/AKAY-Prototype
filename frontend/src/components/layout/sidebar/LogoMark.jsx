import { LOGO_SRC } from "./sidebarData";

export default function LogoMark({
  size = "md",
  onClick,
  title,
  ariaLabel = "AKAY Logo",
}) {
  const imageSize = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const clickableProps = onClick
    ? {
        role: "button",
        tabIndex: 0,
        title,
        "aria-label": ariaLabel,
        onClick,
        onKeyDown: (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
          }
        },
      }
    : {};

  return (
    <div
className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm transition-all duration-300 ease-in-out ${
  onClick
    ? "cursor-pointer select-none hover:bg-[#F8FAFC] hover:shadow-md"
    : ""
}`}
      {...clickableProps}
    >
      <img
        src={LOGO_SRC}
        alt="AKAY Logo"
        className={`${imageSize} object-contain`}
        draggable="false"
      />
    </div>
  );
}
