import { UsersRound } from "lucide-react";
import { Link } from "react-router";

const num = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export default function AccountCounts({ accounts }) {
  const source = accounts || {};
  const total = num(source.total);
  const summary = [
    `${total} ${total === 1 ? "user" : "users"}`,
    `${num(source.active)} active`,
    `${num(source.inactive)} inactive`,
    `${num(source.bhc)} BHC`,
    `${num(source.rhu)} RHU`,
  ].join(" · ");

  return (
    <section
      aria-label="Accounts"
      className="flex flex-col gap-3 rounded-xl border border-[#E8ECF0] border-t-2 border-t-slate-300 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="shrink-0 rounded-lg bg-slate-50 p-2 text-slate-700" aria-hidden="true">
          <UsersRound size={17} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
            Accounts
          </p>
          <p className="mt-1 text-sm font-semibold text-[#0F172A]">{summary}</p>
        </div>
      </div>

      <Link
        to="/admin/users"
        className="shrink-0 text-xs font-semibold text-[#B91C1C] hover:text-[#7F1D1D] hover:underline"
      >
        Account directory
      </Link>
    </section>
  );
}
