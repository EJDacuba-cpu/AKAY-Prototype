import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import DashboardLayout from "../../components/layout/DashboardLayout";
import InvitesTab from "../../components/features/password-access/InvitesTab";
import ResetRequestsTab from "../../components/features/password-access/ResetRequestsTab";
import { getStaffRoles } from "../../services/staffRolesService";

const TABS = [
  {
    id: "resets",
    label: "Reset requests",
    description: "Review requests and send secure one-time reset links. Links expire after 60 minutes.",
  },
  {
    id: "invites",
    label: "Invites",
    description: "New accounts set their own password from a one-time invite link. Links expire after 48 hours.",
  },
];

/** Password & Invites (spec D7): reset requests and account invites, one status vocabulary. `?tab=invites` opens the second tab. */
export default function PasswordResetRequests() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "invites" ? "invites" : "resets";
  const [rolesData, setRolesData] = useState(null);

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

  // Arrow keys move between the two tabs, as the tab pattern expects.
  function onTabKeyDown(event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = TABS[(TABS.findIndex((tab) => tab.id === activeTab) + 1) % TABS.length];
    selectTab(next.id);
    document.getElementById(`access-tab-${next.id}`)?.focus();
  }

  return (
    <DashboardLayout role="admin" title="Password & Invites">
      <div className="mx-auto w-full max-w-[1500px]">
        {/* Same underlined strip as the patient profile: no box, a thin rule, and a brand-red underline on the active tab. */}
        <div
          role="tablist"
          aria-label="Password & Invites"
          onKeyDown={onTabKeyDown}
          className="flex gap-1 shadow-[inset_0_-1px_0_var(--color-neutral-200)]"
        >
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`access-tab-${tab.id}`}
                aria-selected={active}
                aria-controls="access-tabpanel"
                tabIndex={active ? 0 : -1}
                onClick={() => selectTab(tab.id)}
                className={`whitespace-nowrap border-b-2 px-3 pb-2.5 pt-2 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-400/50 ${
                  active
                    ? "border-brand-600 text-neutral-900"
                    : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-800"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <p className="mb-4 mt-3 max-w-2xl text-[13px] text-neutral-600">
          {TABS.find((tab) => tab.id === activeTab).description}
        </p>

        <div role="tabpanel" id="access-tabpanel" aria-labelledby={`access-tab-${activeTab}`}>
          {activeTab === "invites" ? (
            <InvitesTab key="invites" rolesData={rolesData} />
          ) : (
            <ResetRequestsTab key="resets" rolesData={rolesData} />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
