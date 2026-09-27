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
 * Nothing in this file is persisted: it is in-memory, per browser session,
 * so the UI can be reviewed before the backend (program_enrollments table,
 * RHU program management page, real API) is built in Phase 2. Every export
 * here is async and shaped like the eventual API response so swapping the
 * bodies for real `apiRequest` calls later should not require touching the
 * components that call this service.
 */

let nextEnrollmentId = 1000;

/** Static catalog of programs "published" to this BHC. Not per-BHC yet. */
const PUBLISHED_PROGRAMS = Object.freeze([
  {
    id: "prog-1",
    name: "Nutrition Month 2026",
    type: "Feeding",
    runStart: "2026-07-01",
    runEnd: "2026-07-31",
    publishingRhu: "Bulakan RHU",
  },
  {
    id: "prog-2",
    name: "Community Deworming Drive",
    type: "Deworming",
    runStart: "2026-09-01",
    runEnd: "2026-09-30",
    publishingRhu: "Bulakan RHU",
  },
  {
    id: "prog-3",
    name: "Hypertension & Diabetes Screening",
    type: "Screening",
    runStart: "2026-08-15",
    runEnd: "2026-12-15",
    publishingRhu: "Bulakan RHU",
  },
  {
    id: "prog-4",
    name: "Maternal Health Education Series",
    type: "Health Education",
    runStart: "2026-06-01",
    runEnd: "2026-12-31",
    publishingRhu: "Bulakan RHU",
  },
]);

/** patientId -> enrollment[]. Lazily seeded on first read so the tab never opens empty during review. */
const enrollmentsByPatient = new Map();

function delay(ms = 150) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findProgram(programId) {
  return PUBLISHED_PROGRAMS.find((program) => program.id === programId) || null;
}

function seedIfEmpty(patientId) {
  if (enrollmentsByPatient.has(patientId)) return;

  const seedProgram = PUBLISHED_PROGRAMS[0];
  enrollmentsByPatient.set(patientId, [
    {
      id: String(nextEnrollmentId++),
      patientId,
      programId: seedProgram.id,
      programName: seedProgram.name,
      programType: seedProgram.type,
      runStart: seedProgram.runStart,
      runEnd: seedProgram.runEnd,
      publishingRhu: seedProgram.publishingRhu,
      enrolledDate: "2026-07-05",
      status: "Enrolled",
      notes: "",
      withdrawReason: "",
      updatedAt: "2026-07-05",
    },
  ]);
}

/** Programs published to this BHC that patients can be enrolled into. */
export async function getPublishedPrograms() {
  await delay();
  return PUBLISHED_PROGRAMS.map((program) => ({ ...program }));
}

/** One patient's community program enrollments, newest first. */
export async function getPatientEnrollments(patientId) {
  await delay();
  const key = String(patientId || "");
  seedIfEmpty(key);
  return [...(enrollmentsByPatient.get(key) || [])].sort((a, b) =>
    (b.enrolledDate || "").localeCompare(a.enrolledDate || ""),
  );
}

/** Enrolls a patient in a published program that they are not already actively enrolled in. */
export async function enrollPatient(patientId, { programId, enrolledDate, notes = "" }) {
  await delay();
  const key = String(patientId || "");
  seedIfEmpty(key);
  const program = findProgram(programId);
  if (!program) throw new Error("Unknown program.");

  const existing = enrollmentsByPatient.get(key) || [];
  const alreadyActive = existing.some(
    (enrollment) => enrollment.programId === programId && enrollment.status === "Enrolled",
  );
  if (alreadyActive) throw new Error("Patient is already enrolled in this program.");

  const enrollment = {
    id: String(nextEnrollmentId++),
    patientId: key,
    programId: program.id,
    programName: program.name,
    programType: program.type,
    runStart: program.runStart,
    runEnd: program.runEnd,
    publishingRhu: program.publishingRhu,
    enrolledDate: enrolledDate || new Date().toISOString().slice(0, 10),
    status: "Enrolled",
    notes,
    withdrawReason: "",
    updatedAt: new Date().toISOString().slice(0, 10),
  };
  enrollmentsByPatient.set(key, [...existing, enrollment]);
  return { ...enrollment };
}

function updateEnrollment(patientId, enrollmentId, changes) {
  const key = String(patientId || "");
  const existing = enrollmentsByPatient.get(key) || [];
  let updated = null;
  const next = existing.map((enrollment) => {
    if (enrollment.id !== String(enrollmentId)) return enrollment;
    updated = { ...enrollment, ...changes, updatedAt: new Date().toISOString().slice(0, 10) };
    return updated;
  });
  if (!updated) throw new Error("Enrollment not found.");
  enrollmentsByPatient.set(key, next);
  return updated;
}

/** Marks an enrollment as completed. */
export async function completeEnrollment(patientId, enrollmentId) {
  await delay();
  return { ...updateEnrollment(patientId, enrollmentId, { status: "Completed" }) };
}

/** Withdraws a patient from a program, with a required reason. */
export async function withdrawEnrollment(patientId, enrollmentId, reason) {
  await delay();
  if (!String(reason || "").trim()) throw new Error("A reason is required to withdraw.");
  return {
    ...updateEnrollment(patientId, enrollmentId, {
      status: "Withdrawn",
      withdrawReason: String(reason).trim(),
    }),
  };
}
