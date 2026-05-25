import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  User,
  Stethoscope,
  HeartPulse,
  ArrowLeft,
  Save,
  Send,
  Search,
  AlertCircle,
} from "lucide-react";
import DashboardLayout from "../../layouts/DashboardLayout";
import healthRecordService from "../../services/healthRecordService";

/* ─── Keyframes ─── */
const keyframes = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .anim-fade-up { animation: fadeUp 0.55s cubic-bezier(0.22,1,0.36,1) both; }
`;
const stagger = (i) => ({ animationDelay: `${i * 65}ms` });

/* ─── Reusable Sub-Components ─── */
function FormSection({ title, subtitle, icon, children, delay = 0, accent }) {
  const borderClass = accent === "pink" ? "border-t-2 border-t-pink-600" : "";
  return (
    <div
      className={`anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-6 shadow-sm ${borderClass}`}
      style={stagger(delay)}
    >
      <div className="flex items-center gap-2.5 border-b border-[#F3F4F6] pb-4">
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${
            accent === "pink"
              ? "bg-pink-50 text-pink-600"
              : "bg-red-50 text-[#B91C1C]"
          }`}
        >
          {icon}
        </div>
        <div>
          <h2
            className={`text-sm font-bold ${accent === "pink" ? "text-pink-800" : "text-[#1A1A1A]"}`}
          >
            {title}
          </h2>
          {subtitle && <p className="text-xs text-[#6B7280]">{subtitle}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function FieldInput({ label, required, ...props }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        {...props}
        className="h-10 w-full rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3.5 text-sm text-[#1F2937] outline-none transition-all duration-200 placeholder:text-[#9CA3AF] focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}

function FieldSelect({ label, required, children, ...props }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        {...props}
        required={required}
        className="h-10 w-full appearance-none rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3.5 text-sm text-[#1F2937] outline-none transition-all duration-200 focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {children}
      </select>
    </div>
  );
}

/* ─── Main Component ─── */
export default function AddHealthRecord() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const recordId = searchParams.get("recordId");
  const preselectedPatientId = searchParams.get("patientId") || "";
  const isFollowUp = !!recordId;

  /* ─── Patient State ─── */
  const [patients, setPatients] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");

  /* ─── Consultation States ─── */
  const [dateOfVisit, setDateOfVisit] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [timeOfVisit, setTimeOfVisit] = useState(
    new Date().toTimeString().split(" ")[0].slice(0, 5),
  );
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [summaryOfPresentIllness, setSummaryOfPresentIllness] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [medication, setMedication] = useState("");
  const [attendingStaff, setAttendingStaff] = useState("");
  const [consultationNotes, setConsultationNotes] = useState("");

  /* ─── Vital Signs ─── */
  const [bp, setBp] = useState("");
  const [temp, setTemp] = useState("");
  const [pulse, setPulse] = useState("");

  /* ─── Monitoring States ─── */
  const [followUpStatus, setFollowUpStatus] = useState("Under Monitoring");
  const [followUpDate, setFollowUpDate] = useState("");
  const [monitoringNotes, setMonitoringNotes] = useState("");
  const [needsReferral, setNeedsReferral] = useState("no");
  const [returnAfter, setReturnAfter] = useState("");
  const [patientCondition, setPatientCondition] = useState("Improving");

  /* ─── Maternal States ─── */
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [aog, setAog] = useState("");
  const [maternalWeight, setMaternalWeight] = useState("");
  const [maternalBp, setMaternalBp] = useState("");

  /* ─── Immunization States ─── */
  const [vaccineType, setVaccineType] = useState("");
  const [doseNumber, setDoseNumber] = useState("");
  const [nextVaccineDate, setNextVaccineDate] = useState("");

  /* ─────────────────────────────────────────────
      LOAD PATIENTS & HOOK PRESELECTION
  ───────────────────────────────────────────── */
  useEffect(() => {
    const localPatients = localStorage.getItem("patient_details") || "[]";
    const parsedPatients = JSON.parse(localPatients);
    setPatients(parsedPatients);

    if (preselectedPatientId) {
      setSelectedPatientId(preselectedPatientId);
    }
  }, [preselectedPatientId]);

  /* ─── Follow-up: resolve record to patient ─── */
  useEffect(() => {
    if (!recordId) return;
    const records =
      JSON.parse(localStorage.getItem("rhu_health_records")) || [];
    const found = records.find((r) => r.id === recordId || r._id === recordId);
    if (found?.patientId) {
      setSelectedPatientId(found.patientId);
    }
  }, [recordId]);

  /* ─── Helpers ─── */
  const filteredPatients = patients.filter((patient) =>
    `${patient.name || (patient.firstName ? `${patient.firstName} ${patient.lastName}` : "")} ${patient.contactNumber || patient.contact || ""}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase()),
  );

  const selectedPatient = patients.find(
    (patient) => patient.id === selectedPatientId,
  );

  const followUpRecord = isFollowUp
    ? (JSON.parse(localStorage.getItem("rhu_health_records")) || []).find(
        (r) => r.id === recordId || r._id === recordId,
      )
    : null;

  const getPatientClassification = () => {
    if (!selectedPatient) return "";
    return (
      selectedPatient.patientClassification ||
      selectedPatient.category ||
      ""
    ).toLowerCase();
  };

  const concatenatedVitalSigns = `BP: ${bp || "N/A"} | Temp: ${temp || "N/A"} | Pulse: ${pulse || "N/A"}`;

  /* ─────────────────────────────────────────────
      AUTOMATIONS
  ───────────────────────────────────────────── */

  // Auto-calculate follow-up date from "Return After"
  useEffect(() => {
    if (returnAfter && dateOfVisit) {
      const baseDate = new Date(dateOfVisit);
      const map = {
        "After 2 Days": 2,
        "After 1 Week": 7,
        "After 2 Weeks": 14,
        "After 1 Month": 30,
      };
      const days = map[returnAfter] || 0;
      baseDate.setDate(baseDate.getDate() + days);
      setFollowUpDate(baseDate.toISOString().split("T")[0]);
    } else if (!returnAfter) {
      setFollowUpDate("");
    }
  }, [returnAfter, dateOfVisit]);

  // Maternal: auto-set monitoring defaults
  useEffect(() => {
    if (getPatientClassification() === "maternal") {
      setFollowUpStatus("Under Monitoring");
      if (!returnAfter) setReturnAfter("After 1 Month");
    }
  }, [selectedPatientId]);

  // Referred status auto-gates referral
  useEffect(() => {
    if (followUpStatus === "Referred") {
      setNeedsReferral("yes");
      setPatientCondition("Needs Further Assessment");
    } else {
      setNeedsReferral("no");
      if (patientCondition === "Needs Further Assessment") {
        setPatientCondition("Improving");
      }
    }
  }, [followUpStatus]);

  // Maternal: auto-calculate EDD and AOG from LMP
  useEffect(() => {
    const registryLmp = selectedPatient?.lmp || selectedPatient?.LMP;
    if (!registryLmp) {
      setExpectedDeliveryDate("");
      setAog("");
      return;
    }

    const lmpDate = new Date(registryLmp);
    const visitDate = dateOfVisit ? new Date(dateOfVisit) : new Date();

    if (isNaN(lmpDate.getTime())) {
      setExpectedDeliveryDate("Invalid Date");
      setAog("Invalid Date");
      return;
    }

    const edd = new Date(lmpDate);
    edd.setDate(edd.getDate() + 7);
    edd.setMonth(edd.getMonth() - 3);
    edd.setFullYear(edd.getFullYear() + 1);
    setExpectedDeliveryDate(edd.toISOString().split("T")[0]);

    const timeDiff = visitDate.getTime() - lmpDate.getTime();
    if (timeDiff < 0) {
      setAog("Invalid (LMP is ahead of visit)");
    } else {
      const totalDays = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      const weeks = Math.floor(totalDays / 7);
      const days = totalDays % 7;
      if (weeks > 42) {
        setAog("Post-term (>42 Weeks)");
      } else {
        const weekStr = `${weeks} week${weeks !== 1 ? "s" : ""}`;
        const dayStr = days > 0 ? ` and ${days} day${days > 1 ? "s" : ""}` : "";
        setAog(`${weekStr}${dayStr}`);
      }
    }
  }, [selectedPatient, dateOfVisit]);

  // Immunization: auto-calculate next vaccine date
  useEffect(() => {
    if (
      dateOfVisit &&
      doseNumber &&
      doseNumber !== "3rd Dose" &&
      doseNumber !== "Fully Immunized Booster"
    ) {
      const next = new Date(dateOfVisit);
      next.setDate(next.getDate() + 28);
      setNextVaccineDate(next.toISOString().split("T")[0]);
    } else {
      setNextVaccineDate("");
    }
  }, [dateOfVisit, doseNumber]);

  /* ─────────────────────────────────────────────
      FORM SUBMIT
  ───────────────────────────────────────────── */
  async function handleSave(e) {
    e.preventDefault();
    if (!selectedPatientId) {
      alert("Please select a patient first.");
      return;
    }

    let finalStatus = followUpStatus;
    if (getPatientClassification() === "immunization") {
      finalStatus =
        doseNumber === "Fully Immunized Booster"
          ? "Completed"
          : "Under Monitoring";
    }

    const finalChiefComplaint =
      getPatientClassification() === "immunization" && !chiefComplaint
        ? "Vaccination Visit"
        : chiefComplaint;

    const formData = {
      patientId: selectedPatientId,
      patientName:
        selectedPatient?.name ||
        `${selectedPatient?.firstName || ""} ${selectedPatient?.lastName || ""}`,
      patientClassification:
        selectedPatient?.patientClassification ||
        selectedPatient?.category ||
        "General Consultation",
      dateOfVisit,
      timeOfVisit,
      chiefComplaint: finalChiefComplaint,
      summaryOfPresentIllness,
      diagnosis,
      vitalSigns: concatenatedVitalSigns,
      medication,
      attendingStaff,
      consultationNotes,
      followUpStatus: finalStatus,
      followUpDate,
      monitoringNotes,
      returnAfter,
      patientCondition,
      needsReferral,
      referralReason: "",
      referralCategory: null,
      referralAssessmentStatus:
        needsReferral === "yes" ? "Pending RHU Assessment" : null,
      lmp: selectedPatient?.lmp || selectedPatient?.LMP || null,
      pmp: selectedPatient?.pmp || null,
      cycleDuration: selectedPatient?.cycleDuration || null,
      gravida: selectedPatient?.gravida || null,
      para: selectedPatient?.para || null,
      tpal: selectedPatient?.tpal || null,
      expectedDeliveryDate,
      aog,
      maternalWeight,
      maternalBp,
      vaccineType,
      doseNumber,
      nextVaccineDate,
    };

    try {
      await healthRecordService.createHealthRecord(formData);
      navigate("/rhu/health-records");
    } catch (error) {
      console.error("Failed to save record:", error);
      alert("May error sa pag-save ng record. Pakisuri ang console.");
    }
  }

  /* ─── Render ─── */
  return (
    <DashboardLayout role="rhu" title="Add Health Record">
      <style>{keyframes}</style>

      {/* Header */}
      <div className="anim-fade-up mb-8" style={stagger(0)}>
        <Link
          to="/rhu/health-records"
          className="mb-3 inline-flex items-center gap-2 text-[13px] font-semibold text-[#B91C1C] transition-all duration-200 hover:gap-2.5 hover:text-[#991B1B]"
        >
          <ArrowLeft size={16} />
          Back to Health Records
        </Link>

        <h1 className="text-xl font-bold tracking-tight text-[#1A1A1A]">
          {isFollowUp ? "Follow-up Health Record" : "Add Health Record"}
        </h1>

        <p className="mt-1 text-sm text-[#6B7280]">
          {isFollowUp
            ? `Create a follow-up record for ${followUpRecord?.patientName || "this patient"}.`
            : "Record a patient visit, follow-up, monitoring update, or health encounter."}
        </p>

        {isFollowUp && followUpRecord && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-4">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-[#B91C1C]" />
            <p className="text-sm text-red-800">
              Creating a follow-up record for{" "}
              <span className="font-semibold">
                {followUpRecord.patientName}
              </span>
              . Original record:{" "}
              <span className="font-mono font-semibold">{recordId}</span>
            </p>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* ═══ SECTION 1: Patient Selection ═══ */}
        <FormSection
          title="Patient Selection"
          subtitle="Search and select an existing patient profile from the registry."
          icon={<User size={14} />}
          delay={1}
        >
          <div className="grid gap-4">
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                Search Existing Patient
              </label>
              <div className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
                />
                <input
                  type="text"
                  placeholder="Type patient name or contact number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-10 w-full rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] pl-10 pr-3.5 text-sm outline-none transition-all duration-200 focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                Select Patient ({filteredPatients.length} found)
              </label>
              <select
                required
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                disabled={isFollowUp}
                className="h-10 w-full appearance-none rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3.5 text-sm outline-none transition-all duration-200 focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10 disabled:cursor-not-allowed disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF]"
              >
                <option value="">-- Choose Patient --</option>
                {filteredPatients.map((patient) => {
                  const pName =
                    patient.name ||
                    `${patient.firstName || ""} ${patient.lastName || ""}`;
                  const pAge = patient.ageSex
                    ? patient.ageSex
                    : patient.age
                      ? `${patient.age} yrs`
                      : "";
                  const pClass =
                    patient.patientClassification || patient.category || "";
                  return (
                    <option key={patient.id} value={patient.id}>
                      {pName}
                      {pAge ? ` • ${pAge}` : ""}
                      {pClass ? ` [${pClass}]` : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            {selectedPatient && (
              <div className="anim-fade-up rounded-xl border border-red-100 bg-red-50 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100">
                    <User size={12} className="text-[#B91C1C]" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#B91C1C]">
                    Patient Preview
                  </span>
                </div>
                <p className="text-sm font-bold text-[#1A1A1A]">
                  {selectedPatient.name ||
                    `${selectedPatient.firstName || ""} ${selectedPatient.lastName || ""}`}
                </p>
                <p className="mt-0.5 text-[13px] text-[#6B7280]">
                  Age/Sex:{" "}
                  {selectedPatient.ageSex ||
                    (selectedPatient.age
                      ? `${selectedPatient.age} years old / ${selectedPatient.sex || "—"}`
                      : "—")}
                </p>
                <p className="text-[13px] text-[#6B7280]">
                  Contact:{" "}
                  {selectedPatient.contactNumber ||
                    selectedPatient.contact ||
                    "—"}
                </p>
                <p className="text-[13px] text-[#6B7280]">
                  Classification:{" "}
                  <span className="font-semibold text-[#B91C1C]">
                    {selectedPatient.patientClassification ||
                      selectedPatient.category ||
                      "General Consultation"}
                  </span>
                </p>
              </div>
            )}
          </div>
        </FormSection>

        {/* ═══ CONDITIONAL: Immunization ═══ */}
        {getPatientClassification() === "immunization" && (
          <FormSection
            title="Vaccine Information"
            subtitle="Record vaccine details and next immunization schedule."
            icon={<HeartPulse size={14} />}
            delay={2}
          >
            <div className="grid gap-4 lg:grid-cols-3">
              <FieldInput
                label="Vaccine Type"
                placeholder="e.g. Pentavalent, PCV, MMR"
                value={vaccineType}
                onChange={(e) => setVaccineType(e.target.value)}
              />
              <FieldSelect
                label="Dose Number"
                value={doseNumber}
                onChange={(e) => setDoseNumber(e.target.value)}
              >
                <option value="">Select Dose Stage</option>
                <option>1st Dose</option>
                <option>2nd Dose</option>
                <option>3rd Dose</option>
                <option>Fully Immunized Booster</option>
              </FieldSelect>
              <FieldInput
                label="Next Vaccine Date"
                type="date"
                value={nextVaccineDate}
                readOnly
              />
            </div>
          </FormSection>
        )}

        {/* ═══ SECTION 2: Consultation Information ═══ */}
        <FormSection
          title="Consultation Information"
          subtitle="Record consultation findings and observations."
          icon={<Stethoscope size={14} />}
          delay={2}
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <FieldInput
              label="Date of Visit"
              type="date"
              required
              value={dateOfVisit}
              onChange={(e) => setDateOfVisit(e.target.value)}
            />
            <FieldInput
              label="Time of Visit"
              type="time"
              required
              value={timeOfVisit}
              onChange={(e) => setTimeOfVisit(e.target.value)}
            />
            <FieldInput
              label="Chief Complaint"
              placeholder="e.g. Fever, vomiting, cough"
              required
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
            />
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Summary of Present Illness and Physical Examination{" "}
              <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              value={summaryOfPresentIllness}
              onChange={(e) => setSummaryOfPresentIllness(e.target.value)}
              placeholder="Record the detailed history of the present illness and complete physical examination findings here..."
              className="min-h-[140px] w-full rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3.5 py-3 text-sm leading-relaxed outline-none transition-all duration-200 focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10 resize-none"
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <FieldInput
              label="Initial Diagnosis"
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
            />
            <FieldInput
              label="Initial Actions Taken"
              value={medication}
              onChange={(e) => setMedication(e.target.value)}
            />
            <FieldInput
              label="Name of Practitioner"
              value={attendingStaff}
              onChange={(e) => setAttendingStaff(e.target.value)}
            />
          </div>
        </FormSection>

        {/* ═══ SECTION 3: Vital Signs ═══ */}
        <FormSection
          title="Vital Signs"
          subtitle="Record the patient's physiological measurements."
          icon={<HeartPulse size={14} />}
          delay={2.5}
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <FieldInput
              label="Blood Pressure (BP)"
              placeholder="e.g. 120/80"
              value={bp}
              onChange={(e) => setBp(e.target.value)}
            />
            <FieldInput
              label="Temperature"
              placeholder="e.g. 36.5 °C"
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
            />
            <FieldInput
              label="Pulse Rate"
              placeholder="e.g. 72 bpm"
              value={pulse}
              onChange={(e) => setPulse(e.target.value)}
            />
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Additional Consultation Notes (Optional)
            </label>
            <textarea
              value={consultationNotes}
              onChange={(e) => setConsultationNotes(e.target.value)}
              placeholder="Other observations not covered in the summary..."
              className="min-h-24 w-full rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3.5 py-3 text-sm leading-relaxed outline-none transition-all duration-200 focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10 resize-none"
            />
          </div>
        </FormSection>

        {/* ═══ CONDITIONAL: Maternal ═══ */}
        {getPatientClassification() === "maternal" && (
          <FormSection
            title="Maternal & Prenatal Assessment"
            subtitle="Monitor pregnancy progression and maternal clinical vitals."
            icon={<HeartPulse size={14} />}
            delay={3}
            accent="pink"
          >
            <div className="mb-5">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-pink-700">
                Clinical Vitals
              </p>
              <div className="grid gap-4 lg:grid-cols-2">
                <FieldInput
                  label="Maternal Weight (kg)"
                  placeholder="e.g. 60"
                  value={maternalWeight}
                  onChange={(e) => setMaternalWeight(e.target.value)}
                />
                <FieldInput
                  label="Blood Pressure (BP)"
                  placeholder="e.g. 120/80"
                  value={maternalBp}
                  onChange={(e) => setMaternalBp(e.target.value)}
                />
              </div>
            </div>

            <div className="border-t border-[#F3F4F6] pt-5">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-pink-700">
                Obstetric Profile
              </p>
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] p-3">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                    Registered LMP
                  </label>
                  <p className="text-sm font-semibold text-[#1F2937]">
                    {selectedPatient?.lmp
                      ? new Date(selectedPatient.lmp).toLocaleDateString(
                          "en-US",
                          {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          },
                        )
                      : "Not set"}
                  </p>
                </div>
                <FieldInput
                  label="Calculated AOG"
                  value={aog || "Calculating..."}
                  readOnly
                />
                <FieldInput
                  label="Expected Delivery Date"
                  value={expectedDeliveryDate || "Calculating..."}
                  readOnly
                />
              </div>
            </div>
          </FormSection>
        )}

        {/* ═══ SECTION 4: Monitoring and Follow-up ═══ */}
        <FormSection
          title="Monitoring and Follow-up"
          subtitle="Track patient condition and follow-up schedules."
          icon={<HeartPulse size={14} />}
          delay={4}
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <FieldSelect
              label="Status"
              value={followUpStatus}
              onChange={(e) => setFollowUpStatus(e.target.value)}
            >
              <option>Under Monitoring</option>
              <option>Referred</option>
              <option>Completed</option>
            </FieldSelect>
            <FieldSelect
              label="Return After"
              value={returnAfter}
              onChange={(e) => setReturnAfter(e.target.value)}
            >
              <option value="">Select Interval</option>
              <option>After 2 Days</option>
              <option>After 1 Week</option>
              <option>After 2 Weeks</option>
              <option>After 1 Month</option>
            </FieldSelect>
            <FieldInput
              label="Follow-up Date"
              type="date"
              value={followUpDate}
              readOnly
            />
          </div>

          <div className="mt-4">
            <FieldSelect
              label="Patient Condition"
              value={patientCondition}
              onChange={(e) => setPatientCondition(e.target.value)}
            >
              <option>Improving</option>
              <option>Stable</option>
              <option>No Improvement Observed</option>
              <option>Needs Further Assessment</option>
              <option>Recovered</option>
            </FieldSelect>
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Monitoring Notes
            </label>
            <textarea
              value={monitoringNotes}
              onChange={(e) => setMonitoringNotes(e.target.value)}
              placeholder="Write follow-up or monitoring notes..."
              className="min-h-24 w-full rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3.5 py-3 text-sm leading-relaxed outline-none transition-all duration-200 focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10 resize-none"
            />
          </div>
        </FormSection>

        {/* ═══ Actions ═══ */}
        <div
          className="anim-fade-up flex items-center justify-end gap-3 pt-2"
          style={stagger(6)}
        >
          <button
            type="button"
            onClick={() => navigate("/rhu/health-records")}
            className="rounded-xl border border-[#E8ECF0] bg-white px-5 py-2.5 text-sm font-semibold text-[#6B7280] shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D1D5DB] hover:shadow-md active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="group flex items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#B91C1C]/15 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#991B1B] hover:shadow-lg hover:shadow-[#B91C1C]/25 active:scale-[0.98]"
          >
            <Save
              size={15}
              className="transition-transform duration-300 group-hover:scale-110"
            />
            Save Health Record
          </button>
        </div>
      </form>
    </DashboardLayout>
  );
}
