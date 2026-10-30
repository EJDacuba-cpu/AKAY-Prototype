import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { KeyRound, MailPlus } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import InvitesTab from "../../components/features/password-access/InvitesTab";
import ResetRequestsTab from "../../components/features/password-access/ResetRequestsTab";
import { getStaffRoles } from "../../services/staffRolesService";

const TABS = [
  {
    id: "resets",
    label: "Reset requests",
    icon: KeyRound,
    description: "Review requests and send secure one-time reset links. Links expire after 60 minutes.",
  },
  {
    id: "invites",
    label: "Invites",
    icon: MailPlus,
    description: "New accounts set their own password from a one-time invite link. Links expire after 48 hours.",
  },
];

/** Password & Invites (spec D7): reset requests and account invites, one status vocabulary. `?tab=invites` opens the second tab. */
export default function PasswordResetRequests() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "invites" ? "invites" : "resets";
  const [rolesData, setRolesData] = useState(null);
  const focusTabAfterSwitch = useRef(false);

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
    focusTabAfterSwitch.current = true;
    selectTab(next.id);
  }

  // The tabs sit inside each tab's own toolbar, so they remount on a switch; focus the new one once it exists.
  useEffect(() => {
    if (!focusTabAfterSwitch.current) return;
    focusTabAfterSwitch.current = false;
    document.getElementById(`access-tab-${activeTab}`)?.focus();
  }, [activeTab]);

  const activeInfo = TABS.find((tab) => tab.id === activeTab);
  // `lead` is the tab switch, placed at the start of the list's toolbar row (search and Filters follow it).
  const renderPanel = (lead = null) =>
    activeTab === "invites" ? (
      <InvitesTab key="invites" rolesData={rolesData} toolbarLead={lead} />
    ) : (
      <ResetRequestsTab key="resets" rolesData={rolesData} toolbarLead={lead} />
    );

  return (
    <DashboardLayout role="admin" title="Password & Invites">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="mb-4 min-w-0">
          <h2 className="text-xl font-bold tracking-tight text-neutral-900">{activeInfo.label}</h2>
          <p className="mt-1 max-w-xl text-[13px] text-neutral-600">{activeInfo.description}</p>
        </div>

        {renderPanel(
          <div
            role="tablist"
            aria-label="Password & Invites"
            onKeyDown={onTabKeyDown}
            className="inline-flex w-full shrink-0 gap-1 rounded-full border border-neutral-200 bg-white p-1 shadow-xs sm:w-auto"
          >
            {TABS.map((tab) => {
              const active = tab.id === activeTab;
              const Icon = tab.icon;
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
                  className={`inline-flex h-9 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink-400/50 sm:flex-none sm:px-5 ${
                    active ? "bg-red-700 text-white" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  }`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </div>,
        )}
      </div>
    </DashboardLayout>
  );
}
