import { useEffect, useMemo, useState } from "react";
import { Stethoscope } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { ConnectionErrorState, RefreshingIndicator, SuccessModal } from "../../components/common";
import useAccess from "../../hooks/useAccess";
import DoctorAvailabilityModal from "../../components/features/rhu/DoctorAvailabilityModal";
import DoctorDayAbsencesModal from "../../components/features/rhu/DoctorDayAbsencesModal";
import DoctorRosterPanel from "../../components/features/rhu/DoctorRosterPanel";
import DoctorUnavailabilityCalendar from "../../components/features/rhu/DoctorUnavailabilityCalendar";
import {
  useAllProviderUnavailability,
  useProviderMutations,
  useRhuProviders,
} from "../../hooks/useDoctorAvailability";
import { errorStateVariant } from "../../utils/errorStateVariant";
import {
  AVAILABILITY_AVAILABLE,
  AVAILABILITY_UNAVAILABLE,
} from "../../services/doctorAvailability";
import { CHANGE_KIND } from "../../utils/doctorAvailabilityChange";
import { displayedAvailabilityStatus } from "../../utils/doctorRoster";
import {
  formatLongDate,
  groupUnavailabilityByDay,
  manilaCalendarDate,
  manilaDateKey,
  monthRange,
  unavailabilityChipLabel,
} from "../../utils/doctorAvailabilityCalendar";

const MANAGE_PERMISSION = "rhu.providers.manage";

function errorMessage(caught, fallback) {
  return (
    caught?.payload?.errors?.local_date?.[0] ||
    caught?.payload?.errors?.end_time?.[0] ||
    caught?.payload?.errors?.name?.[0] ||
    caught?.payload?.message ||
    caught?.message ||
    fallback
  );
}

export default function DoctorSchedule() {
  const access = useAccess();
  const canManage = access.can(MANAGE_PERMISSION);
  const { providers, isLoading, isFetching, error, refetch } = useRhuProviders();
  const { update, createUnavailability, removeUnavailability } = useProviderMutations();

  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [monthDate, setMonthDate] = useState(() => manilaCalendarDate());
  const [modal, setModal] = useState(null);
  const [modalError, setModalError] = useState("");
  const [dayDate, setDayDate] = useState("");
  const [dayError, setDayError] = useState("");
  const [successNotice, setSuccessNotice] = useState(null);

  const doctors = useMemo(
    () => (Array.isArray(providers) ? providers : []),
    [providers],
  );
  const selectedDoctor =
    doctors.find((doctor) => doctor.id === selectedDoctorId) || null;
  const { rows: allUnavailabilityRows } = useAllProviderUnavailability(
    doctors,
    monthRange(monthDate),
  );
  const visibleUnavailability = useMemo(
    () =>
      selectedDoctor
        ? allUnavailabilityRows.filter(
            (row) => String(row.providerId) === String(selectedDoctor.id),
          )
        : allUnavailabilityRows,
    [allUnavailabilityRows, selectedDoctor],
  );
  const groupedUnavailability = useMemo(
    () => groupUnavailabilityByDay(visibleUnavailability),
    [visibleUnavailability],
  );
  const saving =
    update.isPending || createUnavailability.isPending || removeUnavailability.isPending;

  useEffect(() => {
    if (selectedDoctorId && !selectedDoctor && !isLoading) setSelectedDoctorId("");
  }, [selectedDoctorId, selectedDoctor, isLoading]);

  function openAdd(date) {
    setModalError("");
    setModal({
      nonce: Date.now(),
      doctorId: selectedDoctorId,
      date,
      status: AVAILABILITY_UNAVAILABLE,
    });
  }

  function openManage(doctor) {
    setModalError("");
    setModal({
      nonce: Date.now(),
      doctorId: doctor.id,
      date: manilaDateKey(),
      status:
        displayedAvailabilityStatus(doctor) === AVAILABILITY_AVAILABLE
          ? AVAILABILITY_UNAVAILABLE
          : AVAILABILITY_AVAILABLE,
    });
  }

  function openDay(date) {
    setDayError("");
    setDayDate(date);
  }

  async function submitChange(change) {
    if (!canManage || saving) return;
    setModalError("");

    const notes = change.notes
      ? {
          remarks: change.notes.remarks,
          internalNotes: change.notes.internalNotes,
          expectedAvailableAt: change.notes.expectedAvailableAt,
        }
      : {};

    const name = doctors.find((doctor) => doctor.id === change.doctorId)?.name || "The doctor";

    try {
      let notice;
      if (change.kind === CHANGE_KIND.CONFIRM_AVAILABLE) {
        await update.mutateAsync({
          id: change.doctorId,
          availabilityStatus: AVAILABILITY_AVAILABLE,
        });
        notice = {
          title: "Doctor confirmed available",
          description: `${name} is confirmed as on duty.`,
        };
      } else if (change.kind === CHANGE_KIND.MARK_UNAVAILABLE) {
        await update.mutateAsync({
          id: change.doctorId,
          availabilityStatus: AVAILABILITY_UNAVAILABLE,
          ...notes,
        });
        notice = {
          title: "Doctor marked unavailable",
          description: `${name} stays unavailable until you confirm Available.`,
        };
      } else {
        // Notes first: that PATCH is safe to repeat, so a retry after a failed
        // absence never duplicates anything.
        if (change.notes) await update.mutateAsync({ id: change.doctorId, ...notes });
        await createUnavailability.mutateAsync({
          providerId: change.doctorId,
          ...change.absence,
        });
        notice = {
          title: "Absence scheduled",
          description: `${name} · ${formatLongDate(change.absence.localDate)} · ${unavailabilityChipLabel(change.absence)}`,
        };
      }
      setModal(null);
      setSuccessNotice(notice);
    } catch (caught) {
      setModalError(errorMessage(caught, "The change could not be saved. Please try again."));
    }
  }

  async function removeScheduledAbsence(row) {
    if (!canManage) return;
    setDayError("");
    try {
      await removeUnavailability.mutateAsync({ providerId: row.providerId, id: row.id });
      setDayDate("");
      setSuccessNotice({
        title: "Absence removed",
        description: `${row.doctorName || "The doctor"} · ${formatLongDate(row.localDate)} · ${unavailabilityChipLabel(row)}`,
      });
    } catch (caught) {
      setDayError(errorMessage(caught, "The absence could not be removed."));
    }
  }

  const ready = !isLoading && !error && doctors.length > 0;

  return (
    <DashboardLayout role="rhu" title="Doctor Availability">
      {/* From xl up the module fits the screen (no page scroll at 1366x768); the
          min-height keeps it scrolling normally in a very short window. */}
      <div className="flex flex-col gap-4 xl:h-full xl:min-h-[32rem]">
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-[17px] font-bold leading-tight tracking-tight text-ink-800">Doctor Availability</h1>
            <p className="mt-0.5 text-[13px] text-neutral-600">
              Set who is on duty and schedule absences. Referrals stay blocked after an absence until you confirm Available.
            </p>
          </div>
          {isFetching && doctors.length > 0 ? (
            <div className="shrink-0">
              <RefreshingIndicator label="Updating roster..." />
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <div
            className="grid gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_340px] xl:grid-rows-[minmax(0,1fr)]"
            aria-hidden="true"
          >
            <div className="h-[28rem] animate-pulse rounded-card bg-neutral-100 xl:h-full" />
            <div className="h-[26rem] animate-pulse rounded-card bg-neutral-100 xl:h-full" />
          </div>
        ) : error ? (
          <div className="rounded-card border border-neutral-200 bg-white p-6">
            <ConnectionErrorState
              size="compact"
              variant={errorStateVariant(error)}
              onRetry={() => refetch()}
              retrying={isFetching}
            />
          </div>
        ) : !ready ? (
          <div className="rounded-card border border-neutral-200 bg-white">
            <EmptyRoster />
          </div>
        ) : (
          <div className="grid gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_340px] xl:grid-rows-[minmax(0,1fr)]">
            <DoctorUnavailabilityCalendar
              monthDate={monthDate}
              groupedByDay={groupedUnavailability}
              scopeLabel={selectedDoctor ? selectedDoctor.name : "All doctors"}
              showDoctorNames={!selectedDoctor}
              canAdd={canManage}
              onMonthChange={setMonthDate}
              onAddAt={openAdd}
              onOpenDay={openDay}
            />
            <div className="min-w-0 xl:min-h-0">
              <DoctorRosterPanel
                doctors={doctors}
                selectedDoctorId={selectedDoctorId}
                canManage={canManage}
                onSelectDoctor={setSelectedDoctorId}
                onManageDoctor={openManage}
              />
            </div>
          </div>
        )}

        {modal ? (
          <DoctorAvailabilityModal
            key={modal.nonce}
            doctors={doctors}
            initial={modal}
            canManage={canManage}
            saving={saving}
            error={modalError}
            onClose={() => setModal(null)}
            onSubmit={submitChange}
          />
        ) : null}

        <DoctorDayAbsencesModal
          open={Boolean(dayDate)}
          date={dayDate}
          rows={dayDate ? groupedUnavailability.get(dayDate) || [] : []}
          canManage={canManage}
          saving={saving}
          error={dayError}
          onRemove={removeScheduledAbsence}
          onClose={() => setDayDate("")}
        />

        <SuccessModal
          open={Boolean(successNotice)}
          title={successNotice?.title}
          description={successNotice?.description}
          buttonText="Continue"
          onClose={() => setSuccessNotice(null)}
        />
      </div>
    </DashboardLayout>
  );
}

function EmptyRoster() {
  return (
    <div className="px-6 py-16 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">
        <Stethoscope size={18} aria-hidden="true" />
      </div>
      <p className="text-[13px] font-semibold text-ink-800">No official doctors yet</p>
      <p className="mx-auto mt-1 max-w-sm text-[12px] text-neutral-600">
        Official doctors appear when Admin creates a Doctor account. With none, referrals stay blocked.
      </p>
    </div>
  );
}
