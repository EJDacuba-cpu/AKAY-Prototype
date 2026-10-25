import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import toast from "react-hot-toast";

import { ButtonSpinner } from "../../common";
import useAccess from "../../../hooks/useAccess";
import useRhuVisits from "../../../hooks/useRhuVisits";
import { checkInExistingPatient } from "../../../services/rhuVisitService";
import { queryKeys } from "../../../utils/queryKeys";
import { profileQueueAction, walkInKeyFor } from "../../../utils/rhuQueueView";

const QUEUE_PATH = "/rhu/patients";
const BUTTON_CLASS =
  "inline-flex h-10 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-ink-700 px-4 text-[13px] font-medium text-white shadow-xs transition-colors hover:bg-ink-600 active:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50 focus-visible:ring-offset-2 disabled:bg-neutral-100 disabled:text-neutral-400 disabled:shadow-none";

/**
 * The RHU patient profile never starts a consultation: that happens from Today's Queue. This puts the
 * patient there (check-in) or says where they already are.
 */
export default function ProfileQueueAction({ patientId, patientName }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const access = useAccess();
  const canViewQueue = access.can("clinical.history");
  const canCheckIn = access.can("patients.register");
  const { visits, loading } = useRhuVisits({ enabled: canViewQueue, poll: false });
  const [saving, setSaving] = useState(false);
  // Kept across a failed attempt so a retry for this patient is recognised by the server.
  const walkIn = useRef(null);

  const state = profileQueueAction({ patientId, visits, loading, canCheckIn, canViewQueue });
  if (state.kind === "hidden") return null;

  if (state.kind === "in_queue") {
    return (
      <div className="flex flex-col items-center gap-1 text-[13px]">
        <p className="font-medium text-neutral-800">
          In today&apos;s queue <span aria-hidden="true">·</span> <span className="text-neutral-600">{state.label}</span>
        </p>
        <Link to={QUEUE_PATH} className="rounded-md font-semibold text-ink-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50">
          Go to Today&apos;s Queue →
        </Link>
      </div>
    );
  }

  async function checkIn() {
    setSaving(true);
    try {
      walkIn.current = walkInKeyFor(walkIn.current, patientId);
      await checkInExistingPatient(patientId, walkIn.current.key);
      toast.success(`${patientName || "Patient"} added to today's queue.`);
      walkIn.current = null;
      await client.invalidateQueries({ queryKey: queryKeys.rhuVisits() });
      navigate(QUEUE_PATH);
    } catch (error) {
      if (error?.code === "VISIT_ALREADY_ACTIVE") {
        // Another desk was faster; the outcome is the one we wanted, so show the real status.
        toast(`${patientName || "Patient"} is already in today's queue.`);
        await client.invalidateQueries({ queryKey: queryKeys.rhuVisits() });
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
