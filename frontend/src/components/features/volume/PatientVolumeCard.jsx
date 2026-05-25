import { useEffect, useState } from "react";
import { HeartPulse } from "lucide-react";

import { stagger } from "../../../utils/animation";
import {
  getRhuPatientVolume,
  getRhuPatientVolumeUpdatedTime,
} from "../../../services/volumeService";
export default function PatientVolumeCard({ delay = 0 }) {
  const volumeMap = {
    Low: {
      percent: "18%",
      title: "Low Volume",
      description:
        "RHU currently has manageable patient flow and can accommodate referrals efficiently.",

      expectedWait: "Low",
      referralTiming: "Recommended",

      bar: "from-emerald-400 to-emerald-500",

      container:
        "border-emerald-100 bg-gradient-to-br from-emerald-50 to-white",

      badge: "bg-emerald-100 text-emerald-700",

      pulse: "bg-emerald-500",
    },

    Normal: {
      percent: "48%",
      title: "Normal Volume",

      description:
        "Standard patient activity detected. Referral processing remains stable.",

      expectedWait: "Moderate",
      referralTiming: "Allowed",

      bar: "from-blue-400 to-blue-500",

      container: "border-blue-100 bg-gradient-to-br from-blue-50 to-white",

      badge: "bg-blue-100 text-blue-700",

      pulse: "bg-blue-500",
    },

    High: {
      percent: "82%",
      title: "High Volume",

      description:
        "RHU is currently handling high patient volume. Non-urgent referrals may experience delays.",

      expectedWait: "Long",
      referralTiming: "Urgent only",

      bar: "from-amber-400 to-amber-500",

      container: "border-amber-100 bg-gradient-to-br from-amber-50 to-white",

      badge: "bg-amber-100 text-amber-700",

      pulse: "bg-amber-500",
    },
  };

  const [volume, setVolume] = useState("Normal");
  const [lastUpdated, setLastUpdated] = useState("Not updated");

  useEffect(() => {
    function syncVolume() {
      const savedVolume = getRhuPatientVolume();
      const savedUpdatedTime = getRhuPatientVolumeUpdatedTime("Not updated");

      if (savedVolume && volumeMap[savedVolume]) {
        setVolume(savedVolume);
      }

      if (savedUpdatedTime) {
        setLastUpdated(savedUpdatedTime);
      }
    }

    syncVolume();

    window.addEventListener("storage", syncVolume);

    window.addEventListener("akay-rhu-volume-updated", syncVolume);

    return () => {
      window.removeEventListener("storage", syncVolume);

      window.removeEventListener("akay-rhu-volume-updated", syncVolume);
    };
  }, []);

  const selected = volumeMap[volume] || volumeMap.Normal;

  return (
    <section
      className="anim-fade-up overflow-hidden rounded-2xl border border-[#E8ECF0] bg-white shadow-sm"
      style={stagger(delay)}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#F3F4F6] px-6 py-5">
        <div>
          <h2 className="text-sm font-bold text-[#0B2E59]">
            RHU Patient Volume
          </h2>

          <p className="mt-1 text-xs text-[#9CA3AF]">
            Live RHU receiving capacity for referral coordination.
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

      {/* Body */}
      <div className="grid gap-3 p-6 xl:grid-cols-[250px_minmax(0,1fr)]">
        {/* Left Status Card */}
        <div className={`rounded-2xl border p-5 ${selected.container}`}>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
              <HeartPulse size={24} className="text-[#0B2E59]" />
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#6B7280]">
                Current Status
              </p>

              <h3 className="mt-1 text-2xl font-bold tracking-tight text-[#0B2E59]">
                {selected.title}
              </h3>
            </div>
          </div>

          <p className="mt-5 text-sm leading-relaxed text-[#4B5563]">
            {selected.description}
          </p>

          <div className="mt-5 rounded-xl border border-white/70 bg-white/70 px-4 py-3">
            <p className="text-[11px] font-medium text-[#6B7280]">
              Last RHU update
            </p>

            <p className="mt-1 text-xs font-semibold text-[#0B2E59]">
              {lastUpdated}
            </p>
          </div>
        </div>

        {/* Right Metrics */}
        <div className="flex flex-col justify-center rounded-2xl border border-[#E8ECF0] bg-[#FAFBFC] p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[#4B5563]">
              Capacity Indicator
            </p>

            <p className="text-[11px] font-bold text-[#0B2E59]">
              {selected.percent}
            </p>
          </div>

          {/* Progress */}
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

          {/* Metrics */}
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <VolumeInfoCard
              label="Expected Wait"
              value={selected.expectedWait}
            />

            <VolumeInfoCard
              label="Referral Timing"
              value={selected.referralTiming}
            />

            <VolumeInfoCard label="Managed By" value="RHU" />
          </div>
        </div>
      </div>
    </section>
  );
}

function VolumeInfoCard({ label, value }) {
  return (
    <div className="rounded-xl border border-[#E8ECF0] bg-white p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
        {label}
      </p>

      <p className="mt-2 text-sm font-bold text-[#0B2E59]">{value}</p>
    </div>
  );
}



