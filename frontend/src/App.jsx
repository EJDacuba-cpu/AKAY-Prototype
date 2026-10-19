import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import Login from "./pages/Login";
import Facilities from "./pages/admin/Facilities";
import StaffAssignments from "./pages/admin/StaffAssignments";
import ResetPassword from "./pages/ResetPassword";
import AcceptInvite from "./pages/AcceptInvite";
import ChangePassword from "./pages/ChangePassword";
import { CHANGE_PASSWORD_PATH, needsPasswordChange } from "./utils/passwordChange";
import {
  clearStoredAuthSession,
  getCurrentUser,
  getStoredAuthToken,
  restoreCurrentUserSession,
} from "./utils/auth";
import DashboardLayout from "./components/layout/DashboardLayout";
import { FullScreenAkayLoader } from "./components/common";
import LockedModulePage from "./components/common/access/LockedModulePage";
import useAccess from "./hooks/useAccess";
import { AkayLoadingLifecycleProvider } from "./hooks/useAkayLoadingLifecycle";
import {
  getConsultationBackground,
  locationToPath,
} from "./utils/profileNavigation";
import NotificationsPage from "./pages/bhc/NotificationsPage";
import DesignTokens from "./pages/DesignTokens";
import { queryClient } from "./lib/queryClient";
import {
  clearSensitiveSessionState,
  SENSITIVE_SESSION_CLEARED_EVENT,
  subscribeToCrossTabSessionClear,
} from "./utils/sessionPrivacy";

// BHC Pages
import BHCDashboard from "./pages/bhc/BHCDashboard";
import PatientsModule from "./pages/bhc/PatientsModule";
import ConsultationWorkspace from "./pages/bhc/ConsultationWorkspace";
import AddPatient from "./pages/bhc/AddPatient";
import FamiliesDirectory from "./pages/shared/FamiliesDirectory";
import FamilyDetails from "./pages/shared/FamilyDetails";
import FamilyForm from "./pages/shared/FamilyForm";
import { BhcFamiliesDirectory, BhcFamilyDetails, BhcFamilyForm, BhcAddMember, BhcDeferredFamilyAction } from "./pages/bhc/BhcFamilies";
import BhcFamilyConnections from "./pages/bhc/BhcFamilyConnections";
import RelatedFamilyForm from "./pages/shared/RelatedFamilyForm";
import FamilyMemberForm from "./pages/shared/FamilyMemberForm";
import FollowUps from "./pages/bhc/FollowUps";
import FollowUpDetails from "./pages/bhc/FollowUpDetails";
import Referrals from "./pages/bhc/Referrals";
import CreateReferral from "./pages/bhc/CreateReferral";
import ReferralDetails from "./pages/bhc/ReferralDetails";
import MedicineAvailability from "./pages/bhc/MedicineAvailability";
import BHCReports from "./pages/bhc/BHCReports";
import PatientDetails from "./pages/bhc/PatientDetails";
import { EditPatientRegistration } from "./pages/bhc/AddPatient";
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
const PUBLIC_BOOT_ROUTES = new Set([
  "/",
  "/login",
  "/reset-password",
  "/accept-invite",
  "/unauthorized",
  "/design-tokens",
]);
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

function ProtectedPage({ allowedRole, module, children }) {
  const location = useLocation();
  const { status, user } = useContext(AuthStateContext);
  const access = useAccess();

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
  if (needsPasswordChange(user, location.pathname)) return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  if (user.role !== allowedRole) return <Navigate to="/unauthorized" replace />;
  // A locked module keeps the page frame but never mounts the page, so none of its data is requested.
  if (module && !access.canModule(module)) return <LockedModulePage role={allowedRole} module={module} />;
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
  if (needsPasswordChange(user, location.pathname)) return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  return (
    <DashboardLayout role={user.role} title="Notifications">
      <NotificationsPage />
    </DashboardLayout>
  );
}

function ChangePasswordRoute() {
  const { status, user } = useContext(AuthStateContext);

  if (status === "restoring") return <FullScreenAkayLoader message="Restoring your secure session..." />;
  if (status === "unauthenticated" || !user) return <Navigate to="/login" replace />;
  return <ChangePassword />;
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
        <img src="/akay-logo.png" alt="AKAY" className="mx-auto h-16 w-auto max-w-full object-contain" />
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

  // "View Full Profile" during a consultation keeps that consultation mounted
  // (hidden) underneath the profile, so returning resumes it exactly - no
  // draft reload, no Unfinished Consultation prompt. It survives only a return
  // to its own URL; leaving anywhere else remounts the page tree as usual.
  const consultationBackground = getConsultationBackground(location);
  const backgroundPath = locationToPath(consultationBackground);
  const currentPath = locationToPath(location);
  const mainTreeRef = useRef(null);
  const [heldConsultation, setHeldConsultation] = useState({
    path: "",
    scrollTop: 0,
    treeKey: 0,
    restoreScroll: null,
  });

  if (backgroundPath !== heldConsultation.path) {
    const leaving = Boolean(heldConsultation.path) && !backgroundPath;
    const resumed = leaving && currentPath === heldConsultation.path;
    setHeldConsultation({
      path: backgroundPath,
      scrollTop: backgroundPath ? Number(location.state?.scrollTop) || 0 : 0,
      treeKey:
        leaving && !resumed
          ? heldConsultation.treeKey + 1
          : heldConsultation.treeKey,
      restoreScroll: resumed ? heldConsultation.scrollTop : null,
    });
  }

  // The scroll container lost its offset while hidden; put it back.
  useLayoutEffect(() => {
    if (heldConsultation.restoreScroll === null) return;
    const scroller = mainTreeRef.current?.querySelector(".akay-content-scroll");
    if (scroller) scroller.scrollTop = heldConsultation.restoreScroll;
  }, [heldConsultation.restoreScroll]);

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
      <div
        ref={mainTreeRef}
        key={heldConsultation.treeKey}
        hidden={Boolean(consultationBackground)}
      >
      <Routes location={consultationBackground || location}>
      {["bhc", "rhu"].flatMap(role => [
        <Route key={`${role}-families`} path={`/${role}/families`} element={<ProtectedPage allowedRole={role} module="families">{role === "bhc" ? <BhcFamiliesDirectory /> : <FamiliesDirectory role={role} />}</ProtectedPage>} />,
        <Route key={`${role}-family-new`} path={`/${role}/families/new`} element={<ProtectedPage allowedRole={role} module="familiesManage">{role === "bhc" ? <BhcFamilyForm /> : <FamilyForm role={role} />}</ProtectedPage>} />,
        <Route key={`${role}-family`} path={`/${role}/families/:householdId`} element={<ProtectedPage allowedRole={role} module="families">{role === "bhc" ? <BhcFamilyDetails /> : <FamilyDetails role={role} />}</ProtectedPage>} />,
        <Route key={`${role}-family-edit`} path={`/${role}/families/:householdId/edit`} element={<ProtectedPage allowedRole={role} module="familiesManage">{role === "bhc" ? <BhcFamilyForm /> : <FamilyForm role={role} />}</ProtectedPage>} />,
        <Route key={`${role}-related-new`} path={`/${role}/families/:householdId/related/new`} element={<ProtectedPage allowedRole={role} module="familiesManage">{role === "bhc" ? <BhcDeferredFamilyAction /> : <RelatedFamilyForm role={role} />}</ProtectedPage>} />,
        <Route key={`${role}-member-new`} path={`/${role}/families/:householdId/members/new`} element={<ProtectedPage allowedRole={role} module="familiesManage">{role === "bhc" ? <BhcAddMember /> : <FamilyMemberForm role={role} />}</ProtectedPage>} />,
        <Route key={`${role}-member-edit`} path={`/${role}/families/:householdId/members/:memberId/edit`} element={<ProtectedPage allowedRole={role} module="familiesManage">{role === "bhc" ? <BhcFamilyConnections /> : <FamilyMemberForm role={role} />}</ProtectedPage>} />,
      ])}
      <Route path="/admin/families/*" element={<Navigate to="/unauthorized" replace />} />
      <Route path="/admin/facilities" element={<ProtectedPage allowedRole="admin"><Facilities /></ProtectedPage>} />
      <Route path="/admin/staff-assignments" element={<ProtectedPage allowedRole="admin"><StaffAssignments /></ProtectedPage>} />
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/change-password" element={<ChangePasswordRoute />} />

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
          <ProtectedPage allowedRole="bhc" module="patientDirectory">
            <PatientsModule />
          </ProtectedPage>
        }
      />
      <Route
        path="/bhc/patients/:patientId/edit"
        element={<ProtectedPage allowedRole="bhc" module="patients"><EditPatientRegistration /></ProtectedPage>}
      />
      <Route
        path="/bhc/patients/add"
        element={
          <ProtectedPage allowedRole="bhc" module="patients">
            <AddPatient />
          </ProtectedPage>
        }
      />

      <Route
        path="/bhc/health-records"
        element={
          <ProtectedPage allowedRole="bhc" module="history">
            <Navigate to="/bhc/patients" replace />
          </ProtectedPage>
        }
      />
      <Route
        path="/bhc/health-records/add"
        element={
          <ProtectedPage allowedRole="bhc">
            <ConsultationWorkspace />
          </ProtectedPage>
        }
      />
      <Route
        path="/bhc/follow-ups"
        element={
          <ProtectedPage allowedRole="bhc" module="history">
            <FollowUps />
          </ProtectedPage>
        }
      />
      <Route
        path="/bhc/follow-ups/:taskId"
        element={
          <ProtectedPage allowedRole="bhc" module="history">
            <FollowUpDetails />
          </ProtectedPage>
        }
      />
      <Route
        path="/bhc/referrals"
        element={
          <ProtectedPage allowedRole="bhc" module="history">
            <Referrals />
          </ProtectedPage>
        }
      />
      <Route
        path="/bhc/referrals/create"
        element={
          <ProtectedPage allowedRole="bhc" module="referrals">
            <CreateReferral />
          </ProtectedPage>
        }
      />

      <Route
        path="/bhc/referrals/:trackingId"
        element={
          <ProtectedPage allowedRole="bhc" module="history">
            <ReferralDetails />
          </ProtectedPage>
        }
      />
      <Route
        path="/bhc/medicine-availability"
        element={
          <ProtectedPage allowedRole="bhc" module="inventory">
            <MedicineAvailability />
          </ProtectedPage>
        }
      />
      <Route
        path="/bhc/reports"
        element={
          <ProtectedPage allowedRole="bhc" module="reports">
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
          <ProtectedPage allowedRole="bhc" module="patientDirectory">
            <PatientDetails />
          </ProtectedPage>
        }
      />
      <Route
        path="/bhc/health-records/:recordId"
        element={
          <ProtectedPage allowedRole="bhc" module="history">
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
          <ProtectedPage allowedRole="rhu" module="history">
            <IncomingReferrals />
          </ProtectedPage>
        }
      />
      <Route
        path="/rhu/referrals/:trackingId"
        element={
          <ProtectedPage allowedRole="rhu" module="history">
            <RHUReferralDetails />
          </ProtectedPage>
        }
      />
      <Route
        path="/rhu/qr-scanner"
        element={
          <ProtectedPage allowedRole="rhu" module="history">
            <QRScanner />
          </ProtectedPage>
        }
      />
      <Route
        path="/rhu/patients"
        element={
          <ProtectedPage allowedRole="rhu" module="patients">
            <RHUPatientsModule />
          </ProtectedPage>
        }
      />
      <Route
        path="/rhu/patients/add"
        element={
          <ProtectedPage allowedRole="rhu" module="patients">
            <RHUAddPatient />
          </ProtectedPage>
        }
      />

      <Route
        path="/rhu/patients/:patientId"
        element={
          <ProtectedPage allowedRole="rhu" module="patients">
            <RHUPatientDetails />
          </ProtectedPage>
        }
      />
      <Route
        path="/rhu/health-records"
        element={
          <ProtectedPage allowedRole="rhu" module="history">
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
          <ProtectedPage allowedRole="rhu" module="history">
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
          <ProtectedPage allowedRole="rhu" module="inventory">
            <MedicineManagement />
          </ProtectedPage>
        }
      />
      <Route
        path="/rhu/medicine-management/add"
        element={
          <ProtectedPage allowedRole="rhu" module="inventoryManage">
            <AddMedicineItem />
          </ProtectedPage>
        }
      />

      {/* NEW: Dynamic route with trackingId param */}
      <Route
        path="/rhu/feedback/:trackingId"
        element={
          <ProtectedPage allowedRole="rhu" module="rhu">
            <FeedbackReturnSlip />
          </ProtectedPage>
        }
      />
      <Route
        path="/rhu/reports"
        element={
          <ProtectedPage allowedRole="rhu" module="reports">
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

      {/* Design token preview / QA (public; no PHI). Step 1 evidence page. */}
      <Route path="/design-tokens" element={<DesignTokens />} />

      <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </div>

      {consultationBackground && (
        <Routes>
          <Route
            path="/bhc/patients/:patientId"
            element={
              <ProtectedPage allowedRole="bhc" module="patients">
                <PatientDetails />
              </ProtectedPage>
            }
          />
        </Routes>
      )}
      </AkayLoadingLifecycleProvider>
    </AuthStateContext.Provider>
  );
}
