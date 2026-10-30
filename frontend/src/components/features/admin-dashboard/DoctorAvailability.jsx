import { Stethoscope } from "lucide-react";

import { ConnectionErrorState, InlineSpinner } from "../../common";
import { useRhuProviders } from "../../../hooks/useDoctorAvailability";
import { errorStateVariant } from "../../../utils/errorStateVariant";
import { formatDisplayValue, formatUserName } from "../../../utils/formatters";

export default function DoctorAvailability() {
  const {
    providers,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useRhuProviders();

  return (
    <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="rounded-xl bg-[#FEF2F2] p-3 text-[#B91C1C]">
          <Stethoscope size={20} />
        </div>

        <div>
          <h2 className="text-sm font-semibold text-[#0F172A]">
            Doctor Availability
          </h2>
          <p className="text-xs text-[#9CA3AF]">
            Current RHU doctor status.
          </p>
        </div>
      </div>

      {isLoading ? (
        <InlineSpinner label="Loading doctors..." />
      ) : isError ? (
        <ConnectionErrorState
          size="compact"
          variant={errorStateVariant(error)}
          onRetry={() => refetch()}
          retrying={isFetching}
        />
      ) : (
        <div className="space-y-3">
          {providers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#E8ECF0] bg-[#F8FAFC] p-4 text-xs text-[#9CA3AF]">
              No doctor records encoded yet.
            </div>
          ) : providers.map((doctor) => (
            <div
              key={doctor.id}
              className="rounded-lg border border-[#E8ECF0] bg-[#F8FAFC] p-4"
            >
              <p className="text-sm font-semibold text-[#0F172A]">
                {formatUserName(doctor.name, "Doctor")}
              </p>
              <p className="mt-1 text-xs text-[#6B7280]">
                {formatDisplayValue(doctor.specialization, "RHU Doctor")}
              </p>
              <div className="mt-3">
                <DoctorStatusBadge status={doctor.availabilityStatus} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DoctorStatusBadge({ status }) {
  const displayStatus = formatDisplayValue(status, "Not Available");
  const map = {
    Available: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
    "On Duty": "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
    "Fully Booked": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    "On Leave": "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
  };

  return (
    <span
      className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        map[displayStatus] || "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]"
      }`}
    >
      {displayStatus}
    </span>
  );
}
