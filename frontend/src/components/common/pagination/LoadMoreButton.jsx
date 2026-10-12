export default function LoadMoreButton({ onClick, label = "Load more" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/25"
    >
      {label}
    </button>
  );
}
