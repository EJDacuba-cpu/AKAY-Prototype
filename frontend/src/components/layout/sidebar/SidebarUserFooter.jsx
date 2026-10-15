import { LogOut } from "lucide-react";
import { SIGN_OUT_CLASS } from "./sidebarStyles";
import UserInitials from "./UserInitials";

export default function SidebarUserFooter({ user, onLogout }) {
  return (
    <div className="shrink-0 p-3 pt-2">
      <div className="flex items-center gap-2.5 rounded-xl border border-neutral-200/80 bg-white px-2.5 py-2 shadow-xs">
        <UserInitials name={user.name} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-neutral-900">
            {user.name}
          </p>
          <p className="truncate text-[11px] text-neutral-500">
            {[user.roleLabel || user.position, user.facility].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <button type="button" onClick={onLogout} className={`mt-1.5 ${SIGN_OUT_CLASS}`}>
        <LogOut size={14} />
        Sign out
      </button>
    </div>
  );
}
