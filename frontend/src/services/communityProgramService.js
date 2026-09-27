/**
 * Community Programs - MOCK service (Phase 1 / frontend preview).
 *
 * RHU-created community programs and activities (e.g. Nutrition Month,
 * deworming drives) published to selected BHCs, and the patients explicitly
 * enrolled into them. This is deliberately separate from Care Tracking
 * (see utils/careTracking.js), which is derived read-only from clinical
 * health records - a patient only ever counts as "in" a community program
 * through an explicit enrollment record here.
 *
 * Ownership model (mock, matches the Phase 2 plan): the RHU is the source of
 * truth for a program's schedule, sessions and RHU-assigned staff - the BHC
 * only views those. The BHC may enroll/withdraw/complete its own patients,
 * record attendance against the RHU-defined sessions, and assign its own
 * local staff (free-text for now; no BHC staff roster endpoint exists yet).
 * Only an RHU user finalizes a program (Completed) or cancels it - the BHC
 * side never sets those states, it only reads them.
 *
 * Nothing in this file is persisted: it is in-memory, per browser session,
 * so the UI can be reviewed before the backend (program_enrollments table,
 * RHU program management page, real API) is built in Phase 2. Every export
 * here is async and shaped like the eventual API response so swapping the
 * bodies for real `apiRequest` calls later should not require touching the
 * components that call this service.
 */

let nextEnrollmentId = 1000;
let nextStaffId = 1;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function makeSessions(dates) {
  return dates.map((date, index) => ({
    id: `s${index + 1}`,
    date,
    label: `Session ${index + 1}`,
  }));
}

/** Static catalog of programs "published" to this BHC by the RHU. */
const PROGRAMS = [
  {
    id: "prog-1",
    name: "Nutrition Month 2026",
    category: "Feeding",
    description: "Monthly supplementary feeding and growth monitoring for undernourished children under 5.",
    runStart: "2026-07-01",
    runEnd: "2026-07-31",
    publishingRhu: "Bulakan RHU",
    // Explicit RHU closure - null until an RHU user finalizes the program.
    finalizedStatus: null,
    rhuStaff: [{ id: "rhu-1", name: "Dr. Liza Fernandez", role: "Program Coordinator" }],
    sessions: makeSessions(["2026-07-03", "2026-07-10", "2026-07-17", "2026-07-24", "2026-07-31"]),
  },
  {
    id: "prog-2",
    name: "Community Deworming Drive",
    category: "Deworming",
    description: "Biannual mass deworming for school-age and pre-school children.",
    runStart: "2026-09-01",
    runEnd: "2026-09-30",
    publishingRhu: "Bulakan RHU",
    finalizedStatus: null,
    rhuStaff: [{ id: "rhu-2", name: "Nurse Ramon Cruz", role: "Field Supervisor" }],
    sessions: makeSessions(["2026-09-05", "2026-09-19"]),
  },
  {
    id: "prog-3",
    name: "Hypertension & Diabetes Screening",
    category: "Screening",
    description: "Community-based blood pressure and blood glucose screening for adults 40 and above.",
    runStart: "2026-08-15",
    runEnd: "2026-12-15",
    publishingRhu: "Bulakan RHU",
    finalizedStatus: null,
    rhuStaff: [{ id: "rhu-3", name: "Dr. Liza Fernandez", role: "Program Coordinator" }],
    sessions: makeSessions(["2026-08-20", "2026-09-20", "2026-10-20", "2026-11-20", "2026-12-13"]),
  },
  {
    id: "prog-4",
    name: "Maternal Health Education Series",
    category: "Health Education",
    description: "Monthly prenatal and postpartum health education sessions for enrolled mothers.",
    runStart: "2026-06-01",
    runEnd: "2026-12-31",
    publishingRhu: "Bulakan RHU",
    finalizedStatus: null,
    rhuStaff: [{ id: "rhu-4", name: "Midwife Grace Santos", role: "Session Lead" }],
    sessions: makeSessions(["2026-06-15", "2026-07-15", "2026-08-15", "2026-09-15"]),
  },
  // Kept Completed to preview the Closed tab without waiting on the clock.
  {
    id: "prog-5",
    name: "Summer Feeding Program 2026",
    category: "Feeding",
    description: "Summer break supplementary feeding for identified wasted and severely wasted children.",
    runStart: "2026-04-01",
    runEnd: "2026-05-31",
    publishingRhu: "Bulakan RHU",
    finalizedStatus: "Completed",
    rhuStaff: [{ id: "rhu-1", name: "Dr. Liza Fernandez", role: "Program Coordinator" }],
    sessions: makeSessions(["2026-04-06", "2026-05-04"]),
  },
];

/** programId -> BHC-assigned staff[] (free-text name/role; no staff roster endpoint yet). */
const bhcStaffByProgram = new Map();

/** Flat store, easiest to query both "by patient" and "by program" from. */
let allEnrollments = [];
let seeded = false;

function delay(ms = 150) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findProgram(programId) {
  return PROGRAMS.find((program) => program.id === programId) || null;
}

/**
 * Upcoming (before start) -> Ongoing (within schedule) -> Awaiting
 * Completion (past end date, not yet finalized) -> Completed / Cancelled
 * (explicit RHU action, held in `finalizedStatus`). Routine transitions are
 * automatic; only closing a program is an explicit step, and only an RHU
 * user takes it.
 */
function deriveProgramStatus(program, today = new Date()) {
  if (program.finalizedStatus) return program.finalizedStatus;
  const start = new Date(program.runStart);
  const end = new Date(program.runEnd);
  if (today < start) return "Upcoming";
  if (today <= end) return "Ongoing";
  return "Awaiting Completion";
}

function seedEnrollmentsIfEmpty() {
  if (seeded) return;
  seeded = true;
  allEnrollments = [
    {
      id: String(nextEnrollmentId++),
      patientId: "__preview__",
      patientName: "Preview Patient",
      programId: "prog-1",
      enrolledDate: "2026-07-05",
      status: "Enrolled",
      notes: "",
      withdrawReason: "",
      attendance: { s1: "present", s2: "present", s3: "absent", s4: null, s5: null },
      updatedAt: "2026-07-05",
    },
  ];
}

function enrichProgram(program) {
  return {
    ...program,
    status: deriveProgramStatus(program),
    bhcStaff: [...(bhcStaffByProgram.get(program.id) || [])],
    participantCount: allEnrollments.filter(
      (enrollment) => enrollment.programId === program.id && enrollment.status !== "Withdrawn",
    ).length,
  };
}

function enrichEnrollment(enrollment) {
  const program = findProgram(enrollment.programId);
  return {
    ...enrollment,
    programName: program?.name || "Unknown Program",
    programCategory: program?.category || "",
    runStart: program?.runStart || "",
    runEnd: program?.runEnd || "",
    publishingRhu: program?.publishingRhu || "",
  };
}

/** Every program published to this BHC, with a derived status and participant count. */
export async function getPublishedPrograms() {
  await delay();
  seedEnrollmentsIfEmpty();
  return PROGRAMS.map(enrichProgram);
}

/** One program's full detail: schedule, sessions, RHU + BHC staff, status. */
export async function getProgramDetail(programId) {
  await delay();
  seedEnrollmentsIfEmpty();
  const program = findProgram(programId);
  if (!program) throw new Error("Program not found.");
  return enrichProgram(program);
}

/** One patient's community program enrollments, newest first. */
export async function getPatientEnrollments(patientId) {
  await delay();
  seedEnrollmentsIfEmpty();
  const key = String(patientId || "");
  return allEnrollments
    .filter((enrollment) => enrollment.patientId === key)
    .map(enrichEnrollment)
    .sort((a, b) => (b.enrolledDate || "").localeCompare(a.enrolledDate || ""));
}

/** One program's participants (enrollments), newest first. */
export async function getProgramParticipants(programId) {
  await delay();
  seedEnrollmentsIfEmpty();
  return allEnrollments
    .filter((enrollment) => enrollment.programId === programId)
    .map(enrichEnrollment)
    .sort((a, b) => (b.enrolledDate || "").localeCompare(a.enrolledDate || ""));
}

/** Enrolls a patient in a published program they are not already actively enrolled in. */
export async function enrollPatient({ programId, patientId, patientName, enrolledDate, notes = "" }) {
  await delay();
  seedEnrollmentsIfEmpty();
  const program = findProgram(programId);
  if (!program) throw new Error("Unknown program.");
  const key = String(patientId || "");
  if (!key) throw new Error("A patient is required to enroll.");

  const alreadyActive = allEnrollments.some(
    (enrollment) => enrollment.programId === programId && enrollment.patientId === key && enrollment.status === "Enrolled",
  );
  if (alreadyActive) throw new Error("Patient is already enrolled in this program.");

  const enrollment = {
    id: String(nextEnrollmentId++),
    patientId: key,
    patientName: patientName || "Unknown Patient",
    programId: program.id,
    enrolledDate: enrolledDate || todayIso(),
    status: "Enrolled",
    notes,
    withdrawReason: "",
    attendance: Object.fromEntries(program.sessions.map((session) => [session.id, null])),
    updatedAt: todayIso(),
  };
  allEnrollments = [...allEnrollments, enrollment];
  return enrichEnrollment(enrollment);
}

function updateEnrollment(enrollmentId, changes) {
  let updated = null;
  allEnrollments = allEnrollments.map((enrollment) => {
    if (enrollment.id !== String(enrollmentId)) return enrollment;
    updated = { ...enrollment, ...changes, updatedAt: todayIso() };
    return updated;
  });
  if (!updated) throw new Error("Enrollment not found.");
  return updated;
}

/** Marks an enrollment as completed. */
export async function completeEnrollment(enrollmentId) {
  await delay();
  return enrichEnrollment(updateEnrollment(enrollmentId, { status: "Completed" }));
}

/** Withdraws a patient from a program, with a required reason. */
export async function withdrawEnrollment(enrollmentId, reason) {
  await delay();
  if (!String(reason || "").trim()) throw new Error("A reason is required to withdraw.");
  return enrichEnrollment(
    updateEnrollment(enrollmentId, { status: "Withdrawn", withdrawReason: String(reason).trim() }),
  );
}

/** Records one participant's attendance for one RHU-defined session. */
export async function recordAttendance(enrollmentId, sessionId, mark) {
  await delay();
  if (!["present", "absent", null].includes(mark)) throw new Error("Invalid attendance mark.");
  const enrollment = allEnrollments.find((item) => item.id === String(enrollmentId));
  if (!enrollment) throw new Error("Enrollment not found.");
  return enrichEnrollment(
    updateEnrollment(enrollmentId, {
      attendance: { ...enrollment.attendance, [sessionId]: mark },
    }),
  );
}

/**
 * Adds a BHC-local staff assignment (free-text name/role) to a program. Kept
 * separate from `rhuStaff`, which the RHU owns and the BHC cannot edit here.
 */
export async function addBhcStaffAssignment(programId, { name, role }) {
  await delay();
  if (!String(name || "").trim()) throw new Error("A staff name is required.");
  const assignment = {
    id: `bhc-staff-${nextStaffId++}`,
    name: String(name).trim(),
    role: String(role || "").trim(),
  };
  const existing = bhcStaffByProgram.get(programId) || [];
  bhcStaffByProgram.set(programId, [...existing, assignment]);
  return { ...assignment };
}

/** Removes a BHC-local staff assignment. RHU-assigned staff are never touched here. */
export async function removeBhcStaffAssignment(programId, assignmentId) {
  await delay();
  const existing = bhcStaffByProgram.get(programId) || [];
  bhcStaffByProgram.set(
    programId,
    existing.filter((assignment) => assignment.id !== assignmentId),
  );
}
