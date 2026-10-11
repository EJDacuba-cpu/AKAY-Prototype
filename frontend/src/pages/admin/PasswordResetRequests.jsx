import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import DashboardLayout from "../../components/layout/DashboardLayout";
import InvitesTab from "../../components/features/password-access/InvitesTab";
import ResetRequestsTab from "../../components/features/password-access/ResetRequestsTab";
import { getPasswordInviteSummary } from "../../services/accountInviteService";
import { getStaffRoles } from "../../services/staffRolesService";

const TABS = [
  { id: "resets", label: "Reset requests", countKey: "resetRequests" },
  { id: "invites", label: "Invites", countKey: "invites" },
];

/** Password & Invites (spec D4): reset requests and account invites, one status vocabulary. `?tab=invites` opens the second tab. */
export default function PasswordResetRequests() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "invites" ? "invites" : "resets";
  const [summary, setSummary] = useState(null);
  const [rolesData, setRolesData] = useState(null);

  // The tab counts (Pending rows); refreshed after every action. A failed load keeps the last counts.
  const loadSummary = useCallback(() => {
    getPasswordInviteSummary().then(setSummary).catch(() => {});
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Role labels ("Midwife"); without them the Role column title-cases the key.
  useEffect(() => {
    let active = true;
    getStaffRoles()
      .then((roles) => active && setRolesData(roles))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  function selectTab(id) {
    setSearchParams(id === "invites" ? { tab: "invites" } : {}, { replace: true });
  }

  const tabProps = { rolesData, onChanged: loadSummary };

  return (
    <DashboardLayout role="admin" title="Password & Invites">
      <div className="mb-4 border-b border-slate-200">
        <nav className="-mb-px flex overflow-x-auto" role="tablist" aria-label="Password & Invites">
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            const count = summary?.[tab.countKey];
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`access-tab-${tab.id}`}
                aria-selected={active}
                aria-controls="access-tabpanel"
                onClick={() => selectTab(tab.id)}
                className={`whitespace-nowrap border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
                  active
                    ? "border-[#B91C1C] text-[#B91C1C]"
                    : "border-transparent text-slate-400 hover:border-slate-300 hover:text-slate-600"
                }`}
              >
                {tab.label}
                {count !== undefined && ` (${count})`}
              </button>
            );
          })}
        </nav>
      </div>

      <div role="tabpanel" id="access-tabpanel" aria-labelledby={`access-tab-${activeTab}`}>
        {activeTab === "invites" ? (
          <InvitesTab key="invites" pendingCount={summary?.invites} {...tabProps} />
        ) : (
          <ResetRequestsTab key="resets" pendingCount={summary?.resetRequests} {...tabProps} />
        )}
      </div>
    </DashboardLayout>
  );
}
