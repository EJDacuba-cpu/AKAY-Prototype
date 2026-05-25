import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  User,
  MapPin,
  Phone,
  Calendar,
  FileText,
  HeartPulse,
  Clock,
  AlertTriangle,
  Stethoscope,
  ClipboardList,
  Share2,
  FilePlus2,
  Tag,
  Activity,
  MessageSquare,
  UserCheck,
  RotateCcw,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";

/* ─── Keyframes ─── */
const keyframes = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .anim-fade-up { animation: fadeUp 0.55s cubic-bezier(0.22,1,0.36,1) both; }
`;
const stagger = (i) => ({ animationDelay: `${i * 65}ms` });

/* ─── Mock Data ─── */
const recordDB = {
  "HR-001": {
    id: "HR-001",
    patient: {
      id: "P-001",
      name: "Maria Rosa",
      ageSex: "31/F",
      barangay: "Bagumbayan",
      contact: "0917-123-4567",
    },
    source: "RHU Walk-in",
    visitType: "Consultation",
    concern: "Abdominal pain",
    vitalSigns:
      "BP: 130/85 mmHg · HR: 82 bpm · Temp: 36.8°C · RR: 18 cpm · SpO2: 98%",
    date: "May 13, 2026",
    time: "09:15 AM",
    recordedBy: "Joshua Pio",
    status: "For Referral",
    recordStatus: "Active",
    notes:
      "Patient presented with acute abdominal pain localized in the lower right quadrant. Pain started 6 hours prior to visit. Mild tenderness on palpation. No fever noted. Recommending further evaluation at higher facility for possible appendicitis.",
    monitoringNotes:
      "Patient advised to proceed to district hospital for ultrasound. Follow-up required within 48 hours regardless of outcome.",
    followUpDate: "May 15, 2026",
  },
  "HR-002": {
    id: "HR-002",
    patient: {
      id: "P-002",
      name: "Juan Reyes",
      ageSex: "65/M",
      barangay: "Balubad",
      contact: "0918-234-5678",
    },
    source: "BHC Referral",
    visitType: "Follow-up",
    concern: "Hypertension",
    vitalSigns:
      "BP: 160/100 mmHg · HR: 78 bpm · Temp: 36.5°C · RR: 16 cpm · SpO2: 97%",
    date: "May 13, 2026",
    time: "10:30 AM",
    recordedBy: "Joshua Pio",
    status: "For Monitoring",
    recordStatus: "Active",
    notes:
      "Follow-up visit for chronic hypertension. Blood pressure remains elevated despite current medication (Amlodipine 5mg OD). Dosage adjustment recommended. Patient complains of occasional headache and dizziness.",
    monitoringNotes:
      "Increase Amlodipine to 10mg OD. Monitor BP daily at BHC. Next follow-up in 2 weeks. Advise low-salt diet and regular exercise.",
    followUpDate: "May 27, 2026",
  },
  "HR-003": {
    id: "HR-003",
    patient: {
      id: "P-003",
      name: "John Cruz",
      ageSex: "45/M",
      barangay: "Bambang",
      contact: "0919-345-6789",
    },
    source: "RHU Walk-in",
    visitType: "Consultation",
    concern: "Persistent cough",
    vitalSigns:
      "BP: 125/80 mmHg · HR: 76 bpm · Temp: 37.2°C · RR: 20 cpm · SpO2: 96%",
    date: "May 12, 2026",
    time: "02:45 PM",
    recordedBy: "Joshua Pio",
    status: "Active",
    recordStatus: "Active",
    notes:
      "Patient reports persistent cough for 3 weeks, productive with yellowish sputum. Mild fever in the evenings. No history of TB exposure. Chest auscultation reveals crackles on right lower lobe. Started on antibiotics.",
    monitoringNotes:
      "Prescribed Amoxicillin 500mg TID for 7 days. Follow-up in 5 days to assess response. If no improvement, schedule chest X-ray and sputum exam.",
    followUpDate: "May 17, 2026",
  },
  "HR-004": {
    id: "HR-004",
    patient: {
      id: "P-004",
      name: "David Perez",
      ageSex: "44/M",
      barangay: "Matungao",
      contact: "0920-456-7890",
    },
    source: "BHC Referral",
    visitType: "Immunization",
    concern: "Vaccine schedule",
    vitalSigns:
      "BP: 118/76 mmHg · HR: 72 bpm · Temp: 36.6°C · RR: 16 cpm · SpO2: 99%",
    date: "May 12, 2026",
    time: "11:00 AM",
    recordedBy: "RHU Nurse Team",
    status: "Completed",
    recordStatus: "Closed",
    notes:
      "Patient referred from BHC for influenza vaccine administration. No contraindications identified. Patient has no known allergies. Previous vaccinations up to date.",
    monitoringNotes:
      "Influenza vaccine (2026 Southern Hemisphere formulation) administered via intramuscular injection, left deltoid. Patient observed for 30 minutes post-vaccination — no adverse reactions noted.",
    followUpDate: "",
  },
  "HR-005": {
    id: "HR-005",
    patient: {
      id: "P-005",
      name: "Antonio Santos",
      ageSex: "29/M",
      barangay: "San Francisco",
      contact: "0921-567-8901",
    },
    source: "RHU Walk-in",
    visitType: "Consultation",
    concern: "Severe headache",
    vitalSigns:
      "BP: 150/95 mmHg · HR: 88 bpm · Temp: 37.0°C · RR: 18 cpm · SpO2: 98%",
    date: "May 11, 2026",
    time: "08:30 AM",
    recordedBy: "RHU Duty Doctor",
    status: "Active",
    recordStatus: "Active",
    notes:
      "Patient presents with severe headache for 2 days, unilateral, throbbing character. Associated with nausea and photophobia. No history of migraine. BP slightly elevated. Neurological exam unremarkable. Consider migraine vs. tension-type headache.",
    monitoringNotes:
      "Prescribed Paracetamol 500mg PRN and Ibuprofen 400mg for severe episodes. Advised to monitor BP at home. Follow-up in 1 week. If symptoms worsen, refer for neurologic evaluation.",
    followUpDate: "May 18, 2026",
  },
  "HR-006": {
    id: "HR-006",
    patient: {
      id: "P-006",
      name: "Ana Liza Mendoza",
      ageSex: "27/F",
      barangay: "Bagumbayan",
      contact: "0922-678-9012",
    },
    source: "RHU Walk-in",
    visitType: "Prenatal",
    concern: "Second trimester check-up",
    vitalSigns:
      "BP: 110/70 mmHg · HR: 82 bpm · Temp: 36.7°C · RR: 16 cpm · SpO2: 98%",
    date: "May 11, 2026",
    time: "01:15 PM",
    recordedBy: "RHU Nurse Team",
    status: "Active",
    recordStatus: "Active",
    notes:
      "Routine prenatal visit at 24 weeks AOG. Fundal height appropriate for gestational age. Fetal heart tone 145 bpm, normal. No edema, no proteinuria. Iron supplementation ongoing. Patient reports good fetal movements.",
    monitoringNotes:
      "Continue prenatal vitamins with Iron and Folic Acid. Next visit in 4 weeks for 28-week check-up. Schedule OGTT for gestational diabetes screening. Tetanus toxoid booster due on next visit.",
    followUpDate: "June 8, 2026",
  },
  "HR-007": {
    id: "HR-007",
    patient: {
      id: "P-007",
      name: "Rosa Linda Garcia",
      ageSex: "68/F",
      barangay: "Balubad",
      contact: "0923-789-0123",
    },
    source: "RHU Walk-in",
    visitType: "Follow-up",
    concern: "Diabetes monitoring",
    vitalSigns:
      "BP: 135/85 mmHg · HR: 74 bpm · Temp: 36.5°C · RR: 16 cpm · SpO2: 97%",
    date: "May 10, 2026",
    time: "10:00 AM",
    recordedBy: "Joshua Pio",
    status: "For Monitoring",
    recordStatus: "Active",
    notes:
      "Follow-up for Type 2 Diabetes Mellitus. Random blood sugar: 180 mg/dL (elevated). Currently on Metformin 500mg BID. Patient reports occasional polyuria and fatigue. HbA1c due for repeat.",
    monitoringNotes:
      "Increase Metformin to 500mg TID. Repeat FBS and HbA1c in 2 weeks. Reinforce dietary counseling — low carbohydrate, high fiber diet. Foot care education reiterated.",
    followUpDate: "May 24, 2026",
  },
  "HR-008": {
    id: "HR-008",
    patient: {
      id: "P-001",
      name: "Maria Rosa",
      ageSex: "31/F",
      barangay: "Bagumbayan",
      contact: "0917-123-4567",
    },
    source: "RHU Walk-in",
    visitType: "Prenatal",
    concern: "Routine check-up",
    vitalSigns:
      "BP: 120/78 mmHg · HR: 80 bpm · Temp: 36.6°C · RR: 16 cpm · SpO2: 99%",
    date: "April 25, 2026",
    time: "09:00 AM",
    recordedBy: "RHU Nurse Team",
    status: "Active",
    recordStatus: "Active",
    notes:
      "Prenatal visit at 20 weeks AOG. Fundal height at umbilicus, consistent with gestational age. Fetal heart tone 140 bpm. No complaints. Lab results: CBC normal, blood type O+, urine normal.",
    monitoringNotes:
      "Continue prenatal vitamins. Anomaly scan recommended before 24 weeks. Schedule next prenatal visit in 4 weeks.",
    followUpDate: "May 23, 2026",
  },
};

const defaultRecord = {
  id: "HR-000",
  patient: {
    id: "P-000",
    name: "Unknown Patient",
    ageSex: "N/A",
    barangay: "N/A",
    contact: "N/A",
  },
  source: "N/A",
  visitType: "N/A",
  concern: "N/A",
  vitalSigns: "N/A",
  date: "N/A",
  time: "N/A",
  recordedBy: "N/A",
  status: "Active",
  recordStatus: "Active",
  notes: "No record details available.",
  monitoringNotes: "",
  followUpDate: "",
};

/* ─── Maps ─── */
const statusMap = {
  Active: { bg: "#ECFDF5", text: "#047857", dot: "#10B981" },
  "For Referral": { bg: "#FFF7ED", text: "#C2410C", dot: "#F97316" },
  "For Monitoring": { bg: "#FFFBEB", text: "#B45309", dot: "#F59E0B" },
  Completed: { bg: "#EFF6FF", text: "#1D4ED8", dot: "#3B82F6" },
};

const sourceMap = {
  "RHU Walk-in": { bg: "#F8FAFC", text: "#475569", border: "#E2E8F0" },
  "BHC Referral": { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
  "Monitoring Update": { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A" },
};

const recordStatusMap = {
  Active: { bg: "#ECFDF5", text: "#047857", border: "#A7F3D0" },
  Closed: { bg: "#F3F4F6", text: "#475569", border: "#D1D5DB" },
};

/* ───────────────── MAIN ───────────────── */

export default function HealthRecordDetails() {
  const { recordId } = useParams();
  const record = recordDB[recordId] || { ...defaultRecord, id: recordId };

  const s = statusMap[record.status] || statusMap.Active;
  const src = sourceMap[record.source] || sourceMap["RHU Walk-in"];
  const rs = recordStatusMap[record.recordStatus] || recordStatusMap.Active;

  const vitalItems =
    record.vitalSigns !== "N/A"
      ? record.vitalSigns.split("·").map((v) => v.trim())
      : [];

  return (
    <DashboardLayout role="rhu" title="Health Record Details">
      <style>{keyframes}</style>

      {/* ── Back ── */}
      <div className="anim-fade-up mb-6" style={stagger(0)}>
        <Link
          to="/rhu/health-records"
          className="mb-3 inline-flex items-center gap-2 text-[13px] font-semibold text-[#0B2E59] transition-all duration-200 hover:gap-2.5 hover:text-[#092347]"
        >
          <ArrowLeft size={16} />
          Back to Health Records
        </Link>
      </div>

      {/* ── Record Header Card ── */}
      <div
        className="anim-fade-up mb-6 rounded-2xl border border-[#E8ECF0] bg-white p-6 shadow-sm"
        style={stagger(1)}
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-[#EFF6FF] text-[#2563EB]">
              <FileText size={24} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
                  Health Record
                </h1>
                <span className="font-mono text-sm font-semibold text-[#2563EB]">
                  {record.id}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[10px] font-semibold"
                  style={{ backgroundColor: s.bg, color: s.text }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: s.dot }}
                  />
                  {record.status}
                </span>
                <span
                  className="inline-block rounded-lg border px-2.5 py-1 text-[10px] font-semibold"
                  style={{
                    backgroundColor: rs.bg,
                    color: rs.text,
                    borderColor: rs.border,
                  }}
                >
                  {record.recordStatus}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-semibold"
                  style={{
                    backgroundColor: src.bg,
                    color: src.text,
                    borderColor: src.border,
                  }}
                >
                  {record.source}
                </span>
                <span className="inline-block rounded-lg bg-[#F3F4F6] px-2.5 py-1 text-[10px] font-semibold text-[#4B5563]">
                  {record.visitType}
                </span>
                <span className="inline-block rounded-lg bg-[#F9FAFB] border border-[#E8ECF0] px-2.5 py-1 text-[10px] font-semibold text-[#4B5563]">
                  {record.concern}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <Link
              to={`/rhu/health-records/add?recordId=${record.id}`}
              className="group flex items-center gap-2 rounded-xl border border-[#E8ECF0] bg-white px-4 py-2.5 text-xs font-semibold text-[#4B5563] shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D1D5DB] hover:shadow-md"
            >
              <FilePlus2
                size={14}
                className="text-blue-500 transition-transform duration-300 group-hover:scale-110"
              />
              Add Follow-up
            </Link>
          </div>
        </div>
      </div>

      {/* ── Quick Info Row ── */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <MiniCard
          label="Date"
          value={record.date}
          icon={<Calendar size={14} />}
          delay={2}
        />
        <MiniCard
          label="Time"
          value={record.time}
          icon={<Clock size={14} />}
          delay={3}
        />
        <MiniCard
          label="Recorded By"
          value={record.recordedBy}
          icon={<UserCheck size={14} />}
          delay={4}
        />
        <MiniCard
          label="Follow-up"
          value={record.followUpDate || "None set"}
          icon={<RotateCcw size={14} />}
          delay={5}
        />
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {/* Patient Card */}
          <div
            className="anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-6 shadow-sm"
            style={stagger(6)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                  <User size={14} />
                </div>
                <h2 className="text-sm font-bold tracking-tight text-[#0B2E59]">
                  Patient
                </h2>
              </div>
              <Link
                to={`/rhu/patients/${record.patient.id}`}
                className="text-[11px] font-semibold text-[#2563EB] transition-colors duration-150 hover:text-[#1D4ED8]"
              >
                View full profile →
              </Link>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <InfoCell label="Name" value={record.patient.name} />
              <InfoCell label="Age / Sex" value={record.patient.ageSex} />
              <InfoCell
                label="Barangay"
                value={record.patient.barangay}
                icon={<MapPin size={11} />}
              />
              <InfoCell
                label="Contact"
                value={record.patient.contact}
                icon={<Phone size={11} />}
              />
            </div>
          </div>

          {/* Vital Signs */}
          {vitalItems.length > 0 && (
            <div
              className="anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-6 shadow-sm"
              style={stagger(7)}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                  <Activity size={14} />
                </div>
                <h2 className="text-sm font-bold tracking-tight text-[#0B2E59]">
                  Vital Signs
                </h2>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {vitalItems.map((vital, idx) => {
                  const parts = vital.split(":");
                  const label = parts[0]?.trim() || "";
                  const value = parts[1]?.trim() || "";
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-3 rounded-xl border border-[#F3F4F6] bg-[#FAFBFC] p-3.5"
                    >
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white text-[#2563EB] shadow-sm">
                        <HeartPulse size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                          {label}
                        </p>
                        <p className="mt-0.5 text-[13px] font-bold text-[#1A1A1A]">
                          {value}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes / Observations */}
          <div
            className="anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-6 shadow-sm"
            style={stagger(8)}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                <MessageSquare size={14} />
              </div>
              <h2 className="text-sm font-bold tracking-tight text-[#0B2E59]">
                Notes / Observations
              </h2>
            </div>
            <div className="mt-4 rounded-xl border border-[#F3F4F6] bg-[#FAFBFC] p-4">
              <p className="text-[13px] leading-relaxed text-[#374151]">
                {record.notes}
              </p>
            </div>
          </div>

          {/* Monitoring Notes */}
          {record.monitoringNotes && (
            <div
              className="anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-6 shadow-sm"
              style={stagger(9)}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                  <ClipboardList size={14} />
                </div>
                <h2 className="text-sm font-bold tracking-tight text-[#0B2E59]">
                  Monitoring Notes
                </h2>
              </div>
              <div className="mt-4 rounded-xl border border-[#F3F4F6] bg-[#FAFBFC] p-4">
                <p className="text-[13px] leading-relaxed text-[#374151]">
                  {record.monitoringNotes}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right — Sidebar */}
        <div className="space-y-6">
          {/* Record Info */}
          <div
            className="anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-5 shadow-sm"
            style={stagger(10)}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                <Tag size={14} />
              </div>
              <h3 className="text-sm font-bold tracking-tight text-[#0B2E59]">
                Record Info
              </h3>
            </div>
            <div className="mt-4 space-y-3">
              <DetailRow label="Source" value={record.source} />
              <DetailRow label="Visit Type" value={record.visitType} />
              <DetailRow label="Concern" value={record.concern} />
              <DetailRow label="Status" value={record.status} />
              <DetailRow label="Record Status" value={record.recordStatus} />
            </div>
          </div>

          {/* Quick Actions */}
          <div
            className="anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-5 shadow-sm"
            style={stagger(11)}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                <Stethoscope size={14} />
              </div>
              <h3 className="text-sm font-bold tracking-tight text-[#0B2E59]">
                Quick Actions
              </h3>
            </div>
            <div className="mt-4 space-y-2">
              <Link
                to={`/rhu/patients/${record.patient.id}`}
                className="flex w-full items-center gap-3 rounded-xl border border-[#F3F4F6] bg-[#FAFBFC] px-4 py-3 text-[13px] font-medium text-[#1A1A1A] transition-all duration-200 hover:border-[#DBEAFE] hover:bg-[#EFF6FF]"
              >
                <User size={15} className="text-[#0B2E59]" />
                View Patient Profile
              </Link>
              <Link
                to={`/rhu/health-records/add?recordId=${record.id}`}
                className="flex w-full items-center gap-3 rounded-xl border border-[#F3F4F6] bg-[#FAFBFC] px-4 py-3 text-[13px] font-medium text-[#1A1A1A] transition-all duration-200 hover:border-[#DBEAFE] hover:bg-[#EFF6FF]"
              >
                <FilePlus2 size={15} className="text-blue-500" />
                Add Follow-up Record
              </Link>
              <Link
                to="/rhu/incoming-referrals"
                className="flex w-full items-center gap-3 rounded-xl border border-[#F3F4F6] bg-[#FAFBFC] px-4 py-3 text-[13px] font-medium text-[#1A1A1A] transition-all duration-200 hover:border-[#FED7AA] hover:bg-[#FFF7ED]"
              >
                <Share2 size={15} className="text-orange-500" />
                View Referrals
              </Link>
              <Link
                to="/rhu/health-records"
                className="flex w-full items-center gap-3 rounded-xl border border-[#F3F4F6] bg-[#FAFBFC] px-4 py-3 text-[13px] font-medium text-[#1A1A1A] transition-all duration-200 hover:border-[#E2E8F0] hover:bg-[#F8FAFC]"
              >
                <FileText size={15} className="text-[#64748B]" />
                View All Records
              </Link>
            </div>
          </div>

          {/* Status Note */}
          <div
            className="anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-5 shadow-sm"
            style={stagger(12)}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                <AlertTriangle size={14} />
              </div>
              <h3 className="text-sm font-bold tracking-tight text-[#0B2E59]">
                Status Note
              </h3>
            </div>
            <div className="mt-4">
              {record.status === "For Referral" && (
                <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-4">
                  <p className="text-[12px] leading-relaxed text-[#9A3412]">
                    <span className="font-semibold">Referral required.</span>{" "}
                    This health record indicates the patient needs further
                    evaluation or services at a higher-level facility. Process
                    the referral through Incoming Referrals.
                  </p>
                </div>
              )}
              {record.status === "For Monitoring" && (
                <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
                  <p className="text-[12px] leading-relaxed text-[#92400E]">
                    <span className="font-semibold">Monitoring required.</span>{" "}
                    This record needs ongoing observation. Ensure follow-up
                    visits are scheduled and monitoring notes are updated
                    regularly.
                  </p>
                </div>
              )}
              {record.status === "Active" && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                  <p className="text-[12px] leading-relaxed text-[#065F46]">
                    <span className="font-semibold">Active record.</span> This
                    health record is currently open with ongoing case
                    management. Continue with the prescribed treatment plan.
                  </p>
                </div>
              )}
              {record.status === "Completed" && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                  <p className="text-[12px] leading-relaxed text-[#1E40AF]">
                    <span className="font-semibold">Record completed.</span>{" "}
                    This health encounter has been concluded. All prescribed
                    treatments have been administered and the record is now
                    closed.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

/* ─── Mini Card (top row) ─── */
function MiniCard({ label, value, icon, delay = 0 }) {
  return (
    <div
      className="anim-fade-up rounded-xl border border-[#E8ECF0] bg-white p-4 shadow-sm"
      style={stagger(delay)}
    >
      <div className="flex items-center gap-2 text-[#9CA3AF]">
        {icon}
        <p className="text-[10px] font-semibold uppercase tracking-wider">
          {label}
        </p>
      </div>
      <p
        className={`mt-2 text-[13px] font-semibold text-[#0B2E59] ${value === "None set" ? "text-[#BCC3CD] italic font-medium" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

/* ─── Info Cell (patient grid) ─── */
function InfoCell({ label, value, icon }) {
  return (
    <div className="rounded-xl border border-[#F3F4F6] bg-[#FAFBFC] p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </p>
      <div className="mt-1 flex items-center gap-1.5">
        {icon && <span className="text-[#BCC3CD]">{icon}</span>}
        <p className="truncate text-[13px] font-semibold text-[#1A1A1A]">
          {value}
        </p>
      </div>
    </div>
  );
}

/* ─── Detail Row (sidebar) ─── */
function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#F8FAFC] pb-3 last:border-0 last:pb-0">
      <p className="text-[11px] font-medium text-[#9CA3AF]">{label}</p>
      <p className="text-right text-[12px] font-semibold text-[#1A1A1A]">
        {value}
      </p>
    </div>
  );
}

