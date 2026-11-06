import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ResetRequestsTab from "../../components/features/password-access/ResetRequestsTab";
import { getStaffRoles } from "../../services/staffRolesService";

/** Reset Requests: review requests and send secure one-time reset links. Legacy `?tab=invites` redirects to Invites. */
export default function PasswordResetRequests() {
  const [searchParams] = useSearchParams();
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

  if (searchParams.get("tab") === "invites") {
    return <Navigate to="/admin/account-invites" replace />;
  }

  return (
    <DashboardLayout role="admin" title="Reset Requests">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="mb-4 min-w-0">
          <h2 className="text-[17px] font-bold tracking-tight text-ink-800">Reset Requests</h2>
          <p className="mt-1 max-w-xl text-[13px] text-neutral-600">
            Review requests and send secure one-time reset links. Links expire after 60 minutes.
          </p>
        </div>
        <ResetRequestsTab rolesData={rolesData} />
      </div>
    </DashboardLayout>
  );
}
