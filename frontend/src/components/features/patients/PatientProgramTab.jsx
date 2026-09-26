import { Baby, HeartPulse, Info } from "lucide-react";

import SpecializedRecordsTab from "../records/SpecializedRecordsTab";

/**
 * The full-detail area for a conditional program: Women's Health or
 * Pediatric / EPI.
 *
 * The compiled histories this renders are the ones SpecializedRecordsTab
 * already builds from real visits, so nothing is re-derived here. Sections
 * this system does not capture yet are declared as placeholders rather than
 * omitted, so the chart shows what the program is meant to hold and where the
 * gap is, instead of silently looking complete.
 */

export const AREA_CONFIG = {
  womensHealth: {
    icon: HeartPulse,
    title: "Women's Health",
    subtitle:
      "Prenatal, obstetric, maternal laboratory, and family planning records for this patient.",
    emptyText:
      "No women's health records for this patient yet. Records appear here once a Maternal / Prenatal or Family Planning visit is saved.",
    // Sections the program is meant to hold that no field captures yet.
    pending: [
      {
        title: "Obstetric Information",
        detail:
          "Gravida/Para/TPAL and obstetric summary are captured per prenatal visit today; a consolidated obstetric record is not stored at patient level yet.",
      },
      {
        title: "Maternal Laboratory Records",
        detail:
          "Laboratory results (CBC, HBsAg, blood typing, HIV, syphilis, urinalysis) are recorded per visit; a compiled laboratory history is not built yet.",
      },
      {
        title: "Ultrasound History",
        detail:
          "Ultrasound result and date are recorded per prenatal visit; a compiled ultrasound history is not built yet.",
      },
    ],
  },
  pediatric: {
    icon: Baby,
    title: "Pediatric / EPI",
    subtitle:
      "Immunization tracking and dose history for this patient's child health records.",
    emptyText:
      "No pediatric / EPI records for this patient yet. Records appear here once a Child Health / EPI visit is saved.",
    pending: [
      {
        title: "Growth Monitoring History",
        detail:
          "Weight, height, and temperature are recorded per EPI visit; a compiled growth chart is not built yet.",
      },
    ],
  },
};

function PendingSection({ title, detail }) {
  return (
    <div className="rounded-none border border-gray-100 bg-white p-4 ">
      <h4 className="flex items-center gap-2 text-[12.5px] font-bold text-gray-600 font-sans!">
        <Info size={13} className="text-gray-500" />
        {title}
      </h4>
      <p className="mt-1 text-sm leading-relaxed text-gray-500">
        {detail}
      </p>
    </div>
  );
}

export default function PatientProgramTab({
  area,
  patient,
  records = [],
  basePath = "/bhc",
  historyOnly = false,
}) {
  const config = AREA_CONFIG[area.key];
  if (!config) return null;

  const Icon = config.icon;
  const hasRecords = area.recordCount > 0;

  return (
    <div className="space-y-5">
      <header className="rounded-none border border-gray-100 bg-white px-4 py-3 ">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-gray-900 font-sans!">
          <Icon size={15} className="text-red-600" />
          {config.title}
        </h3>
        <p className="mt-0.5 text-sm text-gray-500">{config.subtitle}</p>

        {historyOnly && (
          <p className="mt-2 inline-flex items-center gap-2 rounded-none border border-gray-100 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-600 ">
            <Info size={12} className="text-gray-500" />
            Kept for the record - this patient is no longer eligible for new
            services in this program, but past records remain available.
          </p>
        )}
      </header>

      {hasRecords ? (
        area.programs.map((program) => (
          <SpecializedRecordsTab
            key={program}
            records={records}
            patient={patient}
            basePath={basePath}
            program={program}
          />
        ))
      ) : (
        <p className="rounded-none border border-gray-100 bg-white px-4 py-10 text-center text-sm text-gray-500 ">
          {config.emptyText}
        </p>
      )}

      {config.pending.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-normal r text-gray-500 font-sans!">
            Not yet captured
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {config.pending.map((section) => (
              <PendingSection key={section.title} {...section} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
