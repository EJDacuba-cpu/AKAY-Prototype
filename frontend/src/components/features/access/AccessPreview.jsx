import { Boxes, Building2, CalendarDays, ChartColumn, ClipboardList, ClipboardPen, FileText, PackagePlus, Pill, Users } from "lucide-react";
import ModuleGate from "../../common/access/ModuleGate";
import { ACCESS_MODULES } from "../../../config/accessModules";

const ICONS = {
  patients: Users,
  consultations: ClipboardPen,
  history: FileText,
  followups: CalendarDays,
  referrals: ClipboardList,
  inventory: Boxes,
  inventoryManage: PackagePlus,
  dispensing: Pill,
  reports: ChartColumn,
  rhu: Building2,
};

function Tile({ module }) {
  const Icon = ICONS[module];
  return (
    <div className="flex h-full min-h-20 flex-col justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <Icon size={16} className="text-red-700" aria-hidden="true" />
      <p className="text-xs font-semibold leading-4 text-slate-800">{ACCESS_MODULES[module].label}</p>
    </div>
  );
}

/** Live view of what the account can open, using the same blur guard staff will see; unlocks as boxes are ticked. */
export default function AccessPreview({ permissions }) {
  return (
    <section aria-labelledby="access-preview-title" className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <h2 id="access-preview-title" className="text-sm font-semibold text-slate-900">Access preview</h2>
      <p className="mt-0.5 text-xs text-slate-500">Modules this account can open. Locked modules stay in place, blurred.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {Object.keys(ACCESS_MODULES).map(module => (
          <ModuleGate key={module} module={module} permissions={permissions} compact className="rounded-lg" placeholder={<Tile module={module} />}>
            <Tile module={module} />
          </ModuleGate>
        ))}
      </div>
    </section>
  );
}
