import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import {
  clearStoredAuthSession,
  getCurrentUser,
  getStoredAuthToken,
  restoreCurrentUserSession,
} from "./utils/auth";
import DashboardLayout from "./components/layout/DashboardLayout";
import { FullScreenAkayLoader } from "./components/common";
import { AkayLoadingLifecycleProvider } from "./hooks/useAkayLoadingLifecycle";
import NotificationsPage from "./pages/bhc/NotificationsPage";
import { queryClient } from "./lib/queryClient";
import {
  clearSensitiveSessionState,
  SENSITIVE_SESSION_CLEARED_EVENT,
  subscribeToCrossTabSessionClear,
} from "./utils/sessionPrivacy";

// BHC Pages
import BHCDashboard from "./pages/bhc/BHCDashboard";
import PatientsModule from "./pages/bhc/PatientsModule";
import HealthRecords from "./pages/bhc/HealthRecords";
import AddHealthRecord from "./pages/bhc/AddHealthRecord";
import AddPatient from "./pages/bhc/AddPatient";
import FollowUps from "./pages/bhc/FollowUps";
import Referrals from "./pages/bhc/Referrals";
import CreateReferral from "./pages/bhc/CreateReferral";
import ReferralDetails from "./pages/bhc/ReferralDetails";
import MedicineAvailability from "./pages/bhc/MedicineAvailability";
import BHCReports from "./pages/bhc/BHCReports";
import PatientDetails from "./pages/bhc/PatientDetails";
import HealthRecordDetails from "./pages/bhc/HealthRecordDetails";

// RHU Pages
import RHUDashboard from "./pages/rhu/RHUDashboard";
import IncomingReferrals from "./pages/rhu/IncomingReferrals";
import RHUReferralDetails from "./pages/rhu/ReferralDetails";
import QRScanner from "./pages/rhu/QRScanner";
import RHUPatientsModule from "./pages/rhu/RHUPatientsModule";
import RHUPatientDetails from "./pages/rhu/RHUPatientDetails";
import RHUAddPatient from "./pages/rhu/RHUAddPatient";
import RHUHealthRecord from "./pages/rhu/RHUHealthRecords";
import RHUAddHealthRecords from "./pages/rhu/RHUAddHealthRecords";
import RHURecordDetails from "./pages/rhu/RHURecordDetails";
import DoctorSchedule from "./pages/rhu/DoctorSchedule";
import MedicineManagement from "./pages/rhu/MedicineManagement";
import AddMedicineItem from "./pages/rhu/AddMedicineItem";
import FeedbackReturnSlip from "./pages/rhu/FeedbackReturnSlip";
import RHUReports from "./pages/rhu/RHUReports";

// Admin Pages
import AdminDashboard from "./pages/admin/AdminDashboard";
import UserManagement from "./pages/admin/UserManagement";
import AddUser from "./pages/admin/AddUser";

import AdminReports from "./pages/admin/AdminReports";
import AuditLogs from "./pages/admin/AuditLogs";
import PasswordResetRequests from "./pages/admin/PasswordResetRequests";

const MIN_BOOT_LOADER_MS = 800;
const PUBLIC_BOOT_ROUTES = new Set(["/", "/login", "/reset-password", "/unauthorized"]);
const VALID_APP_ROLES = new Set(["admin", "bhc", "rhu"]);
const AuthStateContext = createContext({ status: "restoring", user: null });

function isPublicBootRoute(pathname = "") {
  return PUBLIC_BOOT_ROUTES.has(pathname);
}

function hasUsableAuthUser(user) {
  return Boolean(user && VALID_APP_ROLES.has(user.role));
}

function shouldClearStoredSession(error) {
  return error?.status === 401 || error?.status === 403;
}

function ProtectedPage({ allowedRole, children }) {
  const location = useLocation();
  const { status, user } = useContext(AuthStateContext);

  if (status === "restoring") return <FullScreenAkayLoader message="Restoring your secure session..." />;
  if (status === "unauthenticated" || !user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: { pathname: location.pathname, search: location.search } }}
      />
    );
  }
  if (user.role !== allowedRole) return <Navigate to="/unauthorized" replace />;
  return children;
}

function Unauthorized() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
        <h1 className="text-3xl font-bold text-red-600">Unauthorized</h1>
        <p className="mt-2 text-slate-600">
          You are not allowed to access this page.
        </p>
        <a
          href="/login"
          className="mt-6 inline-block rounded-xl bg-[#B91C1C] px-4 py-2 font-semibold text-white"
        >
          Back to Login
        </a>
      </div>
    </div>
  );
}

function LegacyRHURecordRedirect() {
  const { recordId } = useParams();
  return <Navigate to={`/rhu/health-records/${recordId}`} replace />;
}

function LegacyBHCReportRedirect() {
  const { reportSlug } = useParams();
  return <Navigate to={`/bhc/reports?type=${reportSlug || "epi-target-client-list"}`} replace />;
}

function NotificationRouteWrapper() {
  const location = useLocation();
  const { status, user } = useContext(AuthStateContext);

  if (status === "restoring") return <FullScreenAkayLoader message="Restoring your secure session..." />;
  if (status === "unauthenticated" || !user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: { pathname: location.pathname, search: location.search } }}
      />
    );
  }
  return (
    <DashboardLayout role={user.role} title="Notifications">
      <NotificationsPage />
    </DashboardLayout>
  );
}

function useAuthBootLoaderReady(shouldRestoreStoredSession, retryKey) {
  const [isBootCheckDone, setIsBootCheckDone] = useState(
    () => !shouldRestoreStoredSession,
  );
  const [isMinimumDurationDone, setIsMinimumDurationDone] = useState(
    () => !shouldRestoreStoredSession,
  );
  const [restoreError, setRestoreError] = useState(null);

  useEffect(() => {
    if (!shouldRestoreStoredSession) {
      setIsBootCheckDone(true);
      setIsMinimumDurationDone(true);
      return undefined;
    }

    let isMounted = true;

    setIsBootCheckDone(false);
    setIsMinimumDurationDone(false);
    setRestoreError(null);

    const minimumTimer = window.setTimeout(() => {
      if (isMounted) setIsMinimumDurationDone(true);
    }, MIN_BOOT_LOADER_MS);

    async function restoreStoredSession() {
      try {
        const user = await restoreCurrentUserSession();

        if (!hasUsableAuthUser(user)) {
          clearStoredAuthSession();
        }
      } catch (error) {
        if (shouldClearStoredSession(error)) {
          clearStoredAuthSession();
        } else {
          setRestoreError(error);
          if (import.meta.env.DEV) {
            console.warn("Unable to restore the AKAY session during boot.", {
              status: error?.status || null,
              code: error?.code || "",
            });
          }
        }
      } finally {
        if (isMounted) setIsBootCheckDone(true);
      }
    }

    restoreStoredSession();

    return () => {
      isMounted = false;
      window.clearTimeout(minimumTimer);
    };
  }, [retryKey, shouldRestoreStoredSession]);

  return {
    isReady: isBootCheckDone && isMinimumDurationDone,
    restoreError,
  };
}

function SessionRestoreUnavailable({ onRetry }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm text-center">
        <img src="/akay-logo-splash.svg" alt="" className="mx-auto h-24 w-24" />
        <h1 className="mt-5 text-lg font-bold text-slate-900">
          Unable to restore your secure session
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Please check your connection and try again.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 h-11 rounded-lg bg-[#B91C1C] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#991B1B] focus:outline-none focus:ring-4 focus:ring-red-700/15"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [, setSessionEpoch] = useState(0);
  const [isRevalidatingBfcache, setIsRevalidatingBfcache] = useState(false);
  const [restoreRetryKey, setRestoreRetryKey] = useState(0);
  const [shouldRestoreStoredSession] = useState(
    () => !isPublicBootRoute(location.pathname),
  );
  const { isReady: isBootLoaderReady, restoreError } = useAuthBootLoaderReady(
    shouldRestoreStoredSession,
    restoreRetryKey,
  );
  const hasCompletedInitialBoot =
    !shouldRestoreStoredSession || isBootLoaderReady;
  const authUser = getStoredAuthToken() ? getCurrentUser() : null;
  const authStatus = !hasCompletedInitialBoot
    ? "restoring"
    : hasUsableAuthUser(authUser)
      ? "authenticated"
      : "unauthenticated";
  const authState = useMemo(
    () => ({ status: authStatus, user: authUser }),
    [authStatus, authUser],
  );

  useEffect(() => {
    function handleSensitiveSessionCleared(event) {
      if (event.detail?.preserveAuthentication) {
        setSessionEpoch((epoch) => epoch + 1);
        return;
      }

      clearStoredAuthSession();
      setSessionEpoch((epoch) => epoch + 1);

      if (!isPublicBootRoute(window.location.pathname)) {
        navigate("/login", {
          replace: true,
          state: {
            sessionEnded: ["session-expired", "session-invalid"].includes(event.detail?.reason),
            sessionReason: event.detail?.reason,
          },
        });
      }
    }

    async function handleCrossTabSessionClear() {
      clearStoredAuthSession();
      await clearSensitiveSessionState({
        queryClient,
        reason: "cross-tab-session-cleared",
        broadcast: false,
      });
      window.location.replace("/login");
    }

    window.addEventListener(
      SENSITIVE_SESSION_CLEARED_EVENT,
      handleSensitiveSessionCleared,
    );
    const unsubscribe = subscribeToCrossTabSessionClear(
      handleCrossTabSessionClear,
    );

    return () => {
      window.removeEventListener(
        SENSITIVE_SESSION_CLEARED_EVENT,
        handleSensitiveSessionCleared,
      );
      unsubscribe();
    };
  }, [navigate]);

  useEffect(() => {
    async function handlePageShow(event) {
      if (!event.persisted || isPublicBootRoute(window.location.pathname)) {
        return;
      }

      setIsRevalidatingBfcache(true);

      try {
        const user = await restoreCurrentUserSession();
        if (!hasUsableAuthUser(user)) {
          await clearSensitiveSessionState({
            queryClient,
            reason: "bfcache-invalid-session",
          });
          clearStoredAuthSession();
          window.location.replace("/login");
          return;
        }
      } catch (error) {
        if (!shouldClearStoredSession(error)) {
          setIsRevalidatingBfcache(false);
          return;
        }
        await clearSensitiveSessionState({
          queryClient,
          reason: "bfcache-session-revalidation-failed",
          broadcast: false,
        });
        clearStoredAuthSession();
        window.location.replace("/login");
        return;
      } finally {
        setIsRevalidatingBfcache(false);
      }
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  if (
    (shouldRestoreStoredSession && !isBootLoaderReady) ||
    isRevalidatingBfcache
  ) {
    return <FullScreenAkayLoader />;
  }

  if (restoreError) {
    return <SessionRestoreUnavailable onRetry={() => setRestoreRetryKey((key) => key + 1)} />;
  }

  return (
    <AuthStateContext.Provider value={authState}>
      <AkayLoadingLifecycleProvider
        hasCompletedInitialBoot={hasCompletedInitialBoot}
      >
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Admin Routes */}
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedPage allowedRole="admin">
            <AdminDashboard />
          </ProtectedPage>
        }
      />
      <Route
        path="/admin/users"
        element={
          <ProtectedPage allowedRole="admin">
            <UserManagement />
          </ProtectedPage>
        }
      />
      <Route
        path="/admin/users/add"
        element={
          <ProtectedPage allowedRole="admin">
            <AddUser />
          </ProtectedPage>
        }
      />

      <Route
        path="/admin/doctors/add"
        element={
          <ProtectedPage allowedRole="admin">
            <AddUser />
          </ProtectedPage>
        }
      />

      <Route
        path="/admin/reports"
        element={
          <ProtectedPage allowedRole="admin">
            <AdminReports />
          </ProtectedPage>
        }
      />
      <Route
        path="/admin/audit-logs"
        element={
          <ProtectedPage allowedRole="admin">
            <AuditLogs />
          </ProtectedPage>
        }
      />
      <Route
        path="/admin/password-reset-requests"
        element={
          <ProtectedPage allowedRole="admin">
            <PasswordResetRequests />
          </ProtectedPage>
        }
      />

      {/* BHC Routes */}
      <Route
        path="/bhc/dashboard"
        element={
          <ProtectedPage allowedRole="bhc">
            <BHCDashboard />
          </ProtectedPage>
        }
      />
      <Route
        path="/bhc/patients"
        element={
          <ProtectedPage allowedRole="bhc">
            <PatientsModule />
          </ProtectedPage>
        }
      />
      <Route
        path="/bhc/patients/add"
        element={
          <ProtectedPage allowedRole="bhc">
            <AddPatient />
          </ProtectedPage>
        }
      />
      <Route
        path="/bhc/patients/edit/:patientId"
        element={
          <ProtectedPage allowedRole="bhc">
            <AddPatient />
          </ProtectedPage>
        }
      />
      <Route
        path="/bhc/health-records"
        element={
          <ProtectedPage allowedRole="bhc">
            <HealthRecords />
          </ProtectedPage>
        }
      />
      <Route
        path="/bhc/health-records/add"
        element={
          <ProtectedPage allowedRole="bhc">
            <AddHealthRecord />
          </ProtectedPage>
        }
      />
      <Route
        path="/bhc/follow-ups"
        element={
          <ProtectedPage allowedRole="bhc">
            <FollowUps />
          </ProtectedPage>
        }
      />
      <Route
        path="/bhc/referrals"
        element={
          <ProtectedPage allowedRole="bhc">
            <Referrals />
          </ProtectedPage>
        }
      />
      <Route
        path="/bhc/referrals/create"
        element={
          <ProtectedPage allowedRole="bhc">
            <CreateReferral />
          </ProtectedPage>
        }
      />

      <Route
        path="/bhc/referrals/:trackingId"
        element={
          <ProtectedPage allowedRole="bhc">
            <ReferralDetails />
          </ProtectedPage>
        }
      />
      <Route
        path="/bhc/medicine-availability"
        element={
          <ProtectedPage allowedRole="bhc">
            <MedicineAvailability />
          </ProtectedPage>
        }
      />
      <Route
        path="/bhc/reports"
        element={
          <ProtectedPage allowedRole="bhc">
            <BHCReports />
          </ProtectedPage>
        }
      />
      <Route
        path="/bhc/reports/:reportSlug"
        element={<LegacyBHCReportRedirect />}
      />
      <Route
        path="/bhc/patients/:patientId"
        element={
          <ProtectedPage allowedRole="bhc">
            <PatientDetails />
          </ProtectedPage>
        }
      />
      <Route
        path="/bhc/health-records/:recordId"
        element={
          <ProtectedPage allowedRole="bhc">
            <HealthRecordDetails />
          </ProtectedPage>
        }
      />
      {/* RHU Routes */}
      <Route
        path="/rhu/dashboard"
        element={
          <ProtectedPage allowedRole="rhu">
            <RHUDashboard />
          </ProtectedPage>
        }
      />
      <Route
        path="/rhu/incoming-referrals"
        element={
          <ProtectedPage allowedRole="rhu">
            <IncomingReferrals />
          </ProtectedPage>
        }
      />
      <Route
        path="/rhu/referrals/:trackingId"
        element={
          <ProtectedPage allowedRole="rhu">
            <RHUReferralDetails />
          </ProtectedPage>
        }
      />
      <Route
        path="/rhu/qr-scanner"
        element={
          <ProtectedPage allowedRole="rhu">
            <QRScanner />
          </ProtectedPage>
        }
      />
      <Route
        path="/rhu/patients"
        element={
          <ProtectedPage allowedRole="rhu">
            <RHUPatientsModule />
          </ProtectedPage>
        }
      />
      <Route
        path="/rhu/patients/add"
        element={
          <ProtectedPage allowedRole="rhu">
            <RHUAddPatient />
          </ProtectedPage>
        }
      />
      <Route
        path="/rhu/patients/:patientId"
        element={
          <ProtectedPage allowedRole="rhu">
            <RHUPatientDetails />
          </ProtectedPage>
        }
      />
      <Route
        path="/rhu/health-records"
        element={
          <ProtectedPage allowedRole="rhu">
            <RHUHealthRecord />
          </ProtectedPage>
        }
      />
      <Route
        path="/rhu/health-records/add"
        element={
          <ProtectedPage allowedRole="rhu">
            <RHUAddHealthRecords />
          </ProtectedPage>
        }
      />
      <Route
        path="/rhu/health-records/:recordId"
        element={
          <ProtectedPage allowedRole="rhu">
            <RHURecordDetails />
          </ProtectedPage>
        }
      />
      <Route
        path="/rhu/doctor-availability"
        element={
          <ProtectedPage allowedRole="rhu">
            <DoctorSchedule />
          </ProtectedPage>
        }
      />
      <Route
        path="/rhu/doctor-schedule"
        element={<Navigate to="/rhu/doctor-availability" replace />}
      />
      <Route
        path="/rhu/medicine-management"
        element={
          <ProtectedPage allowedRole="rhu">
            <MedicineManagement />
          </ProtectedPage>
        }
      />
      <Route
        path="/rhu/medicine-management/add"
        element={
          <ProtectedPage allowedRole="rhu">
            <AddMedicineItem />
          </ProtectedPage>
        }
      />

      {/* NEW: Dynamic route with trackingId param */}
      <Route
        path="/rhu/feedback/:trackingId"
        element={
          <ProtectedPage allowedRole="rhu">
            <FeedbackReturnSlip />
          </ProtectedPage>
        }
      />
      <Route
        path="/rhu/reports"
        element={
          <ProtectedPage allowedRole="rhu">
            <RHUReports />
          </ProtectedPage>
        }
      />

      {/* RHU legacy route aliases */}
      <Route
        path="/rhu/rhu-patients"
        element={<Navigate to="/rhu/patients" replace />}
      />
      <Route
        path="/rhu/rhu-patients/add-patient"
        element={<Navigate to="/rhu/patients/add" replace />}
      />
      <Route
        path="/rhu/rhu-records"
        element={<Navigate to="/rhu/health-records" replace />}
      />
      <Route
        path="/rhu/rhu-health-records/add"
        element={<Navigate to="/rhu/health-records/add" replace />}
      />
      <Route
        path="/rhu/rhu-health-records/:recordId"
        element={<LegacyRHURecordRedirect />}
      />
      <Route
        path="/rhu/rhu-records/:recordId"
        element={<LegacyRHURecordRedirect />}
      />
      <Route
        path="/rhu/walk-in-patients"
        element={<Navigate to="/rhu/patients/add" replace />}
      />

      {/* Notifications Route */}
      <Route path="/notifications" element={<NotificationRouteWrapper />} />

      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </AkayLoadingLifecycleProvider>
    </AuthStateContext.Provider>
  );
}
