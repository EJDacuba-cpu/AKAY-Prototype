/** Round initials badge for the signed-in user in the sidebar footer. */
export default function UserInitials({ name = "" }) {
  const initials =
    String(name)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?";

  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-700 text-[11px] font-semibold tracking-wide text-white"
    >
      {initials}
    </span>
  );
}
