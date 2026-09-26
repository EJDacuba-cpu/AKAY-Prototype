import { LogOut } from "lucide-react";
import { SIGN_OUT_CLASS } from "./sidebarStyles";

export default function SidebarUserFooter({ user, onLogout }) {
  return (
    <div className="shrink-0 border-t border-gray-200 p-2.5">
      <div className="border border-gray-200 bg-gray-50 px-2.5 py-2">
        <p className="truncate text-[12px] font-semibold text-gray-900">
          {user.name}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-gray-500">
          {user.facility}
        </p>
        <p className="truncate text-[11px] text-gray-500">
          {user.roleLabel || user.position}
        </p>
      </div>

      <button type="button" onClick={onLogout} className={`mt-2 ${SIGN_OUT_CLASS}`}>
        <LogOut size={14} />
        Sign out
      </button>
    </div>
  );
}
