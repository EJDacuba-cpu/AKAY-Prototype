import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import toast from "react-hot-toast";

import { ButtonSpinner } from "../../common";
import useAccess from "../../../hooks/useAccess";
import useRhuVisits from "../../../hooks/useRhuVisits";
import { checkInExistingPatient } from "../../../services/rhuVisitService";
import { queryKeys } from "../../../utils/queryKeys";
import { profileQueueAction, walkInKeyFor } from "../../../utils/rhuQueueView";
import { startOrResumeRhuConsultation } from "../../../utils/rhuVisitConsultation";
import RhuStartConsultationModal from "./RhuStartConsultationModal";

const BUTTON_CLASS =
  "inline-flex h-10 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-ink-700 px-4 text-[13px] font-medium text-white shadow-xs transition-colors hover:bg-ink-600 active:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50 focus-visible:ring-offset-2 disabled:bg-neutral-100 disabled:text-neutral-400 disabled:shadow-none";

/**
 * Check-in when the patient is not in today's queue. Start or resume the
 * existing visit through the same APIs as Today's Queue when they already are.
 */
export default function ProfileQueueAction({ patientId, patientName }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const access = useAccess();
  const canViewQueue = access.can("clinical.history");
  const canCheckIn = access.can("patients.register");
  const canEncode = access.can("consultations.encode");
  const canFinalize = access.can("consultations.finalize");
  const { visits, loading } = useRhuVisits({ enabled: canViewQueue, poll: false });
  const [saving, setSaving] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  // Kept across a failed attempt so a retry for this patient is recognised by the server.
  const walkIn = useRef(null);

  const state = profileQueueAction({
    patientId,
    visits,
    loading,
    canCheckIn,
    canViewQueue,
    canEncode,
    canFinalize,
  });
  if (state.kind === "hidden") return null;

  async function refreshVisits() {
    await client.invalidateQueries({ queryKey: queryKeys.rhuVisits() });
  }

  async function openConsultation(mode) {
    if (mode === "start") {
      setStartOpen(true);
      return;
    }
    setSaving(true);
    try {
      const { path } = await startOrResumeRhuConsultation({
        mode,
        visitId: state.visitId,
        patientId,
      });
      await refreshVisits();
      navigate(path);
    } catch (error) {
      toast.error(error?.message || "Unable to resume this consultation.");
      await refreshVisits();
    } finally {
      setSaving(false);
    }
  }

  if (state.kind === "start" || state.kind === "resume") {
    const starting = state.kind === "start";
    return (
      <div className="flex flex-col items-center gap-1.5 text-[13px]">
        <p className="font-medium text-neutral-800">
          In today&apos;s queue <span aria-hidden="true">·</span> <span className="text-neutral-600">{state.label}</span>
        </p>
        <button type="button" disabled={saving} onClick={() => openConsultation(starting ? "start" : "resume")} className={BUTTON_CLASS}>
          {saving ? (
            <>
              <ButtonSpinner />
              Opening consultation...
            </>
          ) : starting ? (
            "Start Consultation"
          ) : (
            "Resume Consultation"
          )}
        </button>
        {startOpen && createPortal(
          <RhuStartConsultationModal
            patientId={patientId}
            visitId={state.visitId}
            patientName={patientName}
            onClose={() => setStartOpen(false)}
            onStarted={async (path) => {
              setStartOpen(false);
              await refreshVisits();
              navigate(path);
            }}
          />,
          document.body,
        )}
      </div>
    );
  }

  if (state.kind === "in_queue") {
    return (
      <p className="text-center text-[13px] font-medium text-neutral-800">
        In today&apos;s queue <span aria-hidden="true">·</span> <span className="text-neutral-600">{state.label}</span>
      </p>
    );
  }

  async function checkIn() {
    setSaving(true);
    try {
      walkIn.current = walkInKeyFor(walkIn.current, patientId);
      await checkInExistingPatient(patientId, walkIn.current.key);
      toast.success(`${patientName || "Patient"} added to today's queue.`);
      walkIn.current = null;
      await refreshVisits();
      navigate("/rhu/patients");
    } catch (error) {
      if (error?.code === "VISIT_ALREADY_ACTIVE") {
        // Another desk was faster; the outcome is the one we wanted, so show the real status.
        toast(`${patientName || "Patient"} is already in today's queue.`);
        await refreshVisits();
      } else {
        toast.error(error?.message || "Unable to check this patient in.");
      }
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || state.kind === "checking";
  return (
    <button type="button" disabled={busy} onClick={checkIn} className={BUTTON_CLASS}>
      {saving ? (
        <>
          <ButtonSpinner />
          Checking in...
        </>
      ) : state.kind === "checking" ? (
        "Checking queue..."
      ) : (
        <>
          <Plus size={15} aria-hidden="true" />
          Check in to today&apos;s queue
        </>
      )}
    </button>
  );
}
