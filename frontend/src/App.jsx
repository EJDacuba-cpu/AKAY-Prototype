import { Navigate, Route, Routes, useParams } from "react-router";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import { getCurrentUser } from "./utils/auth";
import DashboardLayout from "./components/layout/DashboardLayout";
import NotificationsPage from "./pages/bhc/NotificationsPage";

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

function ProtectedPage({ allowedRole, children }) {
  const user = getCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
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

function NotificationRouteWrapper() {
  const user = getCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  return (
    <DashboardLayout role={user.role} title="Notifications">
      <NotificationsPage />
    </DashboardLayout>
  );
}

export default function App() {
  return (
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
        path="/rhu/doctor-schedule"
        element={
          <ProtectedPage allowedRole="rhu">
            <DoctorSchedule />
          </ProtectedPage>
        }
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
  );
}
