// Development-only print fixture. All API calls are synthetic and stay in memory.
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider, Outlet } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { NotificationProvider } from "../../src/hooks/useNotificationsContext";
import { AkayLoadingLifecycleProvider } from "../../src/hooks/useAkayLoadingLifecycle";
import { storeAuthSession } from "../../src/services/apiClient";
import { ALL_PERMISSIONS } from "../../src/utils/actionPermissions";
import BHCReports from "../../src/pages/bhc/BHCReports";
import RHUReports from "../../src/pages/rhu/RHUReports";
import AdminReports from "../../src/pages/admin/AdminReports";
import HealthRecordDetails from "../../src/pages/bhc/HealthRecordDetails";
import RHURecordDetails from "../../src/pages/rhu/RHURecordDetails";
import ReferralDetails from "../../src/pages/bhc/ReferralDetails";
import CreateReferral from "../../src/pages/bhc/CreateReferral";
import RhuToDispense from "../../src/pages/rhu/RhuToDispense";
import ConsultationWorkspace from "../../src/pages/bhc/ConsultationWorkspace";
import "@fontsource-variable/inter";
import "../../src/index.css";

const params = new URLSearchParams(location.search);
const initialPath = params.get("route") || "/bhc/reports";
const role = initialPath.split("/")[1];
const long = params.has("long");
const now = new Date();
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-05`;
const patient = { id: 9001, patient_code: "SYN-9001", first_name: "Synthetic", last_name: "Print Patient", full_name: "Synthetic Print Patient", sex: "Female", birthdate: "1990-01-01", barangay_health_center_id: 11, rural_health_unit_id: role === "rhu" ? 22 : null, status: "active" };
const record = {
  id: 9002, patient_id: 9001, patient, date_recorded: date, created_at: `${date}T09:00:00+08:00`,
  barangay_health_center_id: role === "bhc" ? 11 : null, rural_health_unit_id: role === "rhu" ? 22 : null,
  barangay_health_center: role === "bhc" ? { id: 11, name: "Synthetic BHC" } : null,
  rural_health_unit: role === "rhu" ? { id: 22, name: "Synthetic RHU" } : null,
  category: params.get("program") === "EPI" ? "Immunization" : params.get("program") || "General Consultation", visit_type: "initial_consultation",
  chief_complaint: "Synthetic recorded complaint", history_of_present_illness: "Recorded history, kept exactly as saved.",
  physical_exam: long ? Array.from({ length: 100 }, (_, i) => `Clinical paragraph ${i + 1}: Synthetic observation with long narrative text; no real patient data.`).join("\n\n") : "Synthetic examination",
  diagnosis: "Synthetic assessment", initial_actions_taken: "Synthetic action", prescription: "Synthetic prescription text",
  systolic_bp: 120, diastolic_bp: 80, temperature: 36.7, weight: 60, height: 160,
  dispensed_medicines: long ? Array.from({ length: 90 }, (_, i) => ({ id: i + 1, medicine_name_snapshot: `Synthetic medicine ${i + 1} with a lengthy name`, quantity: 1, unit: "tablet", remarks: `Synthetic instructions ${i + 1}`, created_at: `${date}T09:00:00+08:00` })) : [],
  monitoring_data: { visitPurpose: { services: ["General Consultation"] },
    ...(params.get("program") ? { selectedPrograms: [params.get("program")] } : {}),
  },
  ...(params.get("program") === "TB DOTS" ? { tb_data: { caseNumber: "SYN-TB-9002" }, record_type: "TB DOTS" } : {}),
};
const referral = { id: 9003, tracking_id: "SYN-REF-9003", patient_id: 9001, health_record_id: 9002,
  patient, barangay_health_center_id: 11, rural_health_unit_id: 22,
  barangay_health_center: { id: 11, name: "Synthetic BHC" }, rural_health_unit: { id: 22, name: "Synthetic RHU" },
  referral_datetime: `${date}T09:00:00+08:00`, created_at: `${date}T09:00:00+08:00`,
  reason_for_referral: "Synthetic reason", urgency_level: "Routine", status: "Pending",
};
const analytics = { roles: ["admin", "bhc", "rhu"], statuses: ["active", "inactive"], matrix: { admin: { active: 2, inactive: 1 }, bhc: { active: 4, inactive: 0 }, rhu: { active: 3, inactive: 2 } }, totals: { accounts: 12, canonical_accounts: 12, active: 9, inactive: 3, by_role: { admin: 3, bhc: 4, rhu: 5 } }, other_accounts: 0 };
const labs = [{ id: "synthetic-test", recordId: 9004, testName: "Synthetic laboratory test", resultStatus: "Result Available", collectionDate: date, examinationDate: date, result: "Synthetic current result", original: { result: "Synthetic original result" }, createdAt: `${date}T09:00:00+08:00`, createdBy: 42, addenda: [{ id: 9005, reason: "Synthetic correction reason", createdAt: `${date}T10:00:00+08:00`, createdBy: 42, data: { result: "Synthetic current result" } }], attachments: [] }];

window.printFixture = { calls: [], fail: "", delay: 0, patient, record, referral };
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, options = {}) => {
  const url = new URL(String(input), location.origin);
  if (!url.pathname.includes("/api/")) return originalFetch(input, options);
  const path = url.pathname.replace(/^.*\/api/, "");
  const method = options.method || "GET";
  window.printFixture.calls.push({ path, method });
  if (window.printFixture.delay) await new Promise(resolve => setTimeout(resolve, window.printFixture.delay));
  if (window.printFixture.fail && path.includes(window.printFixture.fail)) return new Response(JSON.stringify({ message: "Synthetic loading failure" }), { status: 503, headers: { "Content-Type": "application/json" } });
  let data = [];
  if (path === "/health/ready") data = { status: "ready" };
  else if (path === "/patients/9001") data = patient;
  else if (path === "/patients") data = [patient];
  else if (path === "/health-records/9002") data = record;
  else if (path === "/health-records") data = [record];
  else if (path === "/health-records/9002/laboratory-tests") data = labs;
  else if (path === "/referrals/9003") data = referral;
  else if (path === "/referrals/9003/qr") data = { qr_value: "SYNTHETIC-SECURE-QR-9003" };
  else if (path === "/referrals/tracking/resolve") data = { referral_id: 9003, tracking_id: referral.tracking_id };
  else if (path === "/referrals") data = method === "POST" ? referral : [];
  else if (path === "/referral-routing") data = { referring_barangay_health_center: { id: 11, name: "Synthetic BHC" }, receiving_rural_health_unit: { id: 22, name: "Synthetic RHU" }, destinations: [{ id: 22, name: "Synthetic RHU", availability: { available_count: 1, total_count: 1, can_submit_referral: true, status: "Available" } }] };
  else if (path === "/reports/admin") data = { account_analytics: analytics };
  else if (path === "/password-invites/summary") data = { invites: 2, reset_requests: 1 };
  else if (path === "/rhu/to-dispense") data = [{ id: 9002, patientName: "Synthetic Print Patient", visitDate: date, status: "pending", prescriptionText: long ? Array.from({ length: 100 }, (_, i) => `Synthetic prescription instruction ${i + 1}: This is a test paragraph, no real medication directions.`).join("\n\n") : "Synthetic prescription instructions" }];
  else if (path === "/rhu-providers/availability") data = { providers: [], can_submit_referral: true, available_count: 1, total_count: 1, status: "Available" };
  else if (path.endsWith("/counts")) data = { unread: 0, total: 0 };
  // Ancillary lists remain empty; no request ever reaches a clinical backend.
  return new Response(JSON.stringify({ data, last_page: 1 }), { status: 200, headers: { "Content-Type": "application/json" } });
};

storeAuthSession({ token: "synthetic-print-fixture-only", user: { id: 42, name: "Synthetic Print Staff", role, permissions: ALL_PERMISSIONS, facility: role === "rhu" ? "Synthetic RHU" : "Synthetic BHC", barangay_health_center_id: role === "bhc" ? 11 : null, rural_health_unit_id: role === "rhu" ? 22 : null } });
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false } } });
const router = createMemoryRouter([{ element: <NotificationProvider><Outlet /></NotificationProvider>, children: [
  { path: "/bhc/reports", element: <BHCReports /> },
  { path: "/rhu/reports", element: <RHUReports /> },
  { path: "/admin/reports", element: <AdminReports /> },
  { path: "/bhc/health-records/:recordId", element: <HealthRecordDetails /> },
  { path: "/rhu/health-records/:recordId", element: <RHURecordDetails /> },
  { path: "/bhc/referrals/create", element: <CreateReferral /> },
  { path: "/bhc/referrals/:trackingId", element: <ReferralDetails /> },
  { path: "/rhu/to-dispense", element: <RhuToDispense /> },
  { path: "/bhc/consultation", element: <ConsultationWorkspace /> },
] }], { initialEntries: [initialPath] });
window.printFixture.client = client;
window.printFixture.router = router;
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={client}><AkayLoadingLifecycleProvider>
    <RouterProvider router={router} /><Toaster />
  </AkayLoadingLifecycleProvider></QueryClientProvider>,
);
