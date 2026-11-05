import { useEffect, useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import InvitesTab from "../../components/features/password-access/InvitesTab";
import { getStaffRoles } from "../../services/staffRolesService";

/** Invites: manage invitations already generated through account setup. */
export default function AccountInvites() {
  const [rolesData, setRolesData] = useState(null);

  useEffect(() => {
    let active = true;
    getStaffRoles()
      .then((roles) => active && setRolesData(roles))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <DashboardLayout role="admin" title="Invites">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="mb-4 min-w-0">
          <h2 className="text-[17px] font-bold tracking-tight text-ink-800">Invites</h2>
          <p className="mt-1 max-w-xl text-[13px] text-neutral-600">
            New accounts set their own password from a one-time invite link. Links expire after 48 hours.
          </p>
        </div>
        <InvitesTab rolesData={rolesData} />
      </div>
    </DashboardLayout>
  );
}
