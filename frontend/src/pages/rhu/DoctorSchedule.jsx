import { useEffect, useMemo, useState } from "react";
import { Stethoscope } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { ConnectionErrorState, PageSkeletonLoader, RefreshingIndicator, SuccessModal } from "../../components/common";
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

function rateLimitWaitMs(error) {
  const seconds = Number(error?.retryAfter);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

export default function DoctorSchedule() {
  const access = useAccess();
  const canManage = access.can(MANAGE_PERMISSION);
  const {
    providers,
    isPending,
    isFetching,
    isError,
    dataUpdatedAt,
    error,
    refetch,
  } = useRhuProviders();
  const { update, createUnavailability, removeUnavailability } = useProviderMutations();

  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [monthDate, setMonthDate] = useState(() => manilaCalendarDate());
  const [modal, setModal] = useState(null);
  const [modalError, setModalError] = useState("");
  const [dayDate, setDayDate] = useState("");
  const [dayError, setDayError] = useState("");
  const [successNotice, setSuccessNotice] = useState(null);
  const [retryGateOpen, setRetryGateOpen] = useState(true);

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
    if (selectedDoctorId && !selectedDoctor && !isPending) setSelectedDoctorId("");
  }, [selectedDoctorId, selectedDoctor, isPending]);

  useEffect(() => {
    const waitMs = rateLimitWaitMs(error);
    if (Number(error?.status) !== 429 || waitMs <= 0) {
      setRetryGateOpen(true);
      return undefined;
    }
    setRetryGateOpen(false);
    const timer = window.setTimeout(() => setRetryGateOpen(true), waitMs);
    return () => window.clearTimeout(timer);
  }, [error]);

  function retryProviders() {
    if (isFetching || !retryGateOpen) return;
    void refetch();
  }

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

  const ready = doctors.length > 0;
  const hasRoster = dataUpdatedAt > 0;
  const accessDenied = isError && [401, 403].includes(Number(error?.status));
  // Terminal failures must leave the skeleton: never keep loading after 429/unreachable.
  const showSkeleton = isPending && !hasRoster && !isError;
  const showFullPageError = isError && (!hasRoster || accessDenied);

  if (showSkeleton) return (
    <DashboardLayout role="rhu" title="Doctor Availability">
      <PageSkeletonLoader skeleton="doctor-calendar" message="Loading doctor availability..." />
    </DashboardLayout>
  );

  if (showFullPageError) {
    return (
      <DashboardLayout role="rhu" title="Doctor Availability">
        <ConnectionErrorState
          fullPage
          variant={errorStateVariant(error)}
          onRetry={retryProviders}
          retrying={isFetching}
          retryDisabled={!retryGateOpen}
        />
      </DashboardLayout>
    );
  }

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
          {isFetching && dataUpdatedAt > 0 ? (
            <div className="shrink-0">
              <RefreshingIndicator label="Updating roster..." />
            </div>
          ) : null}
        </div>

        {error && hasRoster ? (
          <p role="status" className="text-sm text-neutral-600">
            {Number(error.status) === 429
              ? "Too many requests while refreshing. Showing the last roster that loaded."
              : "Unable to refresh doctor availability. Showing the last roster that loaded."}
            {" "}
            <button
              type="button"
              className="font-semibold text-brand-700 hover:underline disabled:opacity-60"
              onClick={retryProviders}
              disabled={isFetching || !retryGateOpen}
            >
              Retry
            </button>
          </p>
        ) : null}
        {!ready ? (
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
