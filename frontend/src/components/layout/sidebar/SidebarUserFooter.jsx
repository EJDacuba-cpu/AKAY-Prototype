import { LogOut } from "lucide-react";

export default function SidebarUserFooter({ user, onLogout }) {
  return (
    <div className="border-t border-[#E5E7EB] p-3">
      <div className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5">
        <p className="truncate text-[12px] font-semibold text-[#1F2937]">
          {user.name}
        </p>
        <p className="mt-0.5 truncate text-[10px] text-[#6B7280]">
          {user.position}
        </p>
      </div>

      <button
        type="button"
        onClick={onLogout}
        className="mt-2.5 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#E5E7EB] bg-white text-[11px] font-semibold text-[#B91C1C] transition hover:border-[#FECACA] hover:bg-[#FEF2F2]"
      >
        <LogOut size={14} />
        Sign out
      </button>
    </div>
  );
}
