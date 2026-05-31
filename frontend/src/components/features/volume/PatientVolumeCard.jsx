import { HeartPulse } from "lucide-react";

import { stagger } from "../../../utils/animation";
import { getRhuVolumeSnapshot } from "../../../services/volumeService";

export default function PatientVolumeCard({ delay = 0, snapshot }) {
  const volumeSnapshot = snapshot || getRhuVolumeSnapshot();
  const counts = volumeSnapshot.counts || {};
  const volumeMap = {
    Low: {
      percent: `${volumeSnapshot.percent || 18}%`,
      title: "Low Volume",
      description:
        "RHU currently has manageable patient flow and can accommodate referrals efficiently.",

      expectedWait: "Low",
      referralTiming: "Recommended",

      bar: "from-emerald-400 to-emerald-500",

      container: "border-emerald-100 bg-emerald-50/60",

      badge: "bg-emerald-100 text-emerald-700",

      pulse: "bg-emerald-500",
    },

    Normal: {
      percent: `${volumeSnapshot.percent || 48}%`,
      title: "Normal Volume",

      description:
        "Standard patient activity detected. Referral processing remains stable.",

      expectedWait: "Moderate",
      referralTiming: "Allowed",

      bar: "from-slate-400 to-slate-500",

      container: "border-slate-200 bg-slate-50/80",

      badge: "bg-slate-100 text-slate-700",

      pulse: "bg-slate-500",
    },

    High: {
      percent: `${volumeSnapshot.percent || 82}%`,
      title: "High Volume",

      description:
        "RHU is currently handling high patient volume. Non-urgent referrals may experience delays.",

      expectedWait: "Long",
      referralTiming: "Urgent only",

      bar: "from-amber-400 to-amber-500",

      container: "border-amber-100 bg-amber-50/70",

      badge: "bg-amber-100 text-amber-700",

      pulse: "bg-amber-500",
    },
  };

  const selected = volumeMap[volumeSnapshot.status] || volumeMap.Normal;

  return (
    <section
      className="anim-fade-up overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm"
      style={stagger(delay)}
    >
      <div className="flex items-center justify-between border-b border-[#F3F4F6] px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-[#0F172A]">
            RHU Patient Volume
          </h2>

          <p className="mt-0.5 text-[11px] text-[#94A3B8]">
            Automatically based on today&apos;s RHU workload.
          </p>
        </div>

        <div
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-bold ${selected.badge}`}
        >
          <span className="relative flex h-2 w-2">
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${selected.pulse}`}
            />

            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${selected.pulse}`}
            />
          </span>
          LIVE
        </div>
      </div>

      <div className="grid gap-3 p-4 xl:grid-cols-[230px_minmax(0,1fr)]">
        <div className={`rounded-lg border p-4 ${selected.container}`}>
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-[#B91C1C] shadow-sm">
              <HeartPulse size={21} />
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#6B7280]">
                Current Status
              </p>

              <h3 className="mt-1 text-xl font-bold tracking-tight text-[#0F172A]">
                {selected.title}
              </h3>
            </div>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-[#4B5563]">
            {selected.description}
          </p>

          <div className="mt-4 rounded-lg border border-white/70 bg-white/75 px-3 py-2.5">
            <p className="text-[11px] font-medium text-[#6B7280]">
              Workload score
            </p>

            <p className="mt-1 text-xs font-semibold text-[#0F172A]">
              {formatScore(volumeSnapshot.workloadScore)}
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-center rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[#4B5563]">
              Capacity Indicator
            </p>

            <p className="text-[11px] font-bold text-[#B91C1C]">
              {selected.percent}
            </p>
          </div>

          <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#E5E7EB]">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${selected.bar}`}
              style={{
                width: selected.percent,
              }}
            />
          </div>

          <div className="mt-2 flex justify-between text-[10px] font-semibold text-[#BCC3CD]">
            <span>Low</span>
            <span>Moderate</span>
            <span>High</span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <VolumeInfoCard
              label="Incoming Today"
              value={counts.incomingReferralsToday || 0}
            />

            <VolumeInfoCard
              label="Walk-ins Today"
              value={counts.walkInPatientsToday || 0}
            />

            <VolumeInfoCard
              label="High Priority"
              value={counts.highPriorityReferrals || 0}
            />

            <VolumeInfoCard
              label="For Monitoring"
              value={counts.patientsForMonitoring || 0}
            />

            <VolumeInfoCard
              label="Received Today"
              value={counts.receivedReferralsToday || 0}
            />

            <VolumeInfoCard
              label="Pending"
              value={counts.pendingReferrals || 0}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function formatScore(value) {
  const score = Number(value || 0);
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function VolumeInfoCard({ label, value }) {
  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
        {label}
      </p>

      <p className="mt-2 text-sm font-bold text-[#0F172A]">{value}</p>
    </div>
  );
}



