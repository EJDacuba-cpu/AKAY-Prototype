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

  // The tabs sit in the toolbar row, as on Facilities.
  const tabs = (
    <div className="flex gap-2" role="tablist" aria-label="Password & Invites">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`access-tab-${tab.id}`}
          aria-selected={tab.id === activeTab}
          aria-controls="access-tabpanel"
          onClick={() => selectTab(tab.id)}
          className={`h-10 rounded-xl px-5 text-sm font-medium transition-colors ${
            tab.id === activeTab ? "bg-[#B91C1C] text-white" : "bg-white text-slate-600 hover:bg-red-50"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <DashboardLayout role="admin" title="Password & Invites">
      <div className="mx-auto w-full max-w-[1500px] space-y-5">
        <p className="text-sm text-slate-500">{TABS.find((tab) => tab.id === activeTab).description}</p>

        <div role="tabpanel" id="access-tabpanel" aria-labelledby={`access-tab-${activeTab}`}>
          {activeTab === "invites" ? (
            <InvitesTab key="invites" rolesData={rolesData} toolbarHeading={tabs} />
          ) : (
            <ResetRequestsTab key="resets" rolesData={rolesData} toolbarHeading={tabs} />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
