import { LogOut } from "lucide-react";

export default function SidebarUserFooter({ user, onLogout }) {
  return (
    <div className="shrink-0 border-t border-slate-200 p-2.5">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold text-slate-900">
            {user.name}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-slate-500">
            {user.facility}
          </p>
          <p className="truncate text-[10px] text-slate-500">
            {user.roleLabel || user.position}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onLogout}
        className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-[#B91C1C] transition hover:border-[#FECACA] hover:bg-[#FEF2F2]"
      >
        <LogOut size={14} />
        Sign out
      </button>
    </div>
  );
}
