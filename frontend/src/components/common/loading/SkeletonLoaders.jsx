import { useEffect, useRef, useState } from "react";

const cardClass = "rounded-xl border border-slate-200 bg-white shadow-sm";
const skeletonBase = "akay-skeleton-block rounded-md bg-[#EEF2F7]";

function SkeletonStyles() {
  return (
    <style>{`
      .akay-skeleton-block {
        position: relative;
        overflow: hidden;
      }

      .akay-skeleton-block::after {
        content: "";
        position: absolute;
        inset: 0;
        transform: translateX(-100%);
        background: linear-gradient(
          90deg,
          transparent,
          rgba(255, 255, 255, 0.64),
          transparent
        );
        animation: akaySkeletonShimmer 1600ms ease-in-out infinite;
      }

      @keyframes akaySkeletonShimmer {
        100% {
          transform: translateX(100%);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .akay-skeleton-block::after {
          animation: none;
        }
      }
    `}</style>
  );
}

function SkeletonBlock({ className = "" }) {
  return <div className={`${skeletonBase} ${className}`} aria-hidden="true" />;
}

function SkeletonRoot({ message, className = "", children }) {
  return (
    <div
      className={`space-y-5 ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <SkeletonStyles />
      <span className="sr-only">{message}</span>
      {children}
    </div>
  );
}

export function TopLoadingBar({
  active = true,
  complete = false,
  className = "",
}) {
  const [visible, setVisible] = useState(active);
  const [progress, setProgress] = useState(active ? 8 : 0);
  const timersRef = useRef([]);

  useEffect(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];

    function queue(callback, delay) {
      const timer = window.setTimeout(callback, delay);
      timersRef.current.push(timer);
    }

    if (!active) {
      setVisible(false);
      setProgress(0);

      return () => {
        timersRef.current.forEach((timer) => window.clearTimeout(timer));
      };
    }

    setVisible(true);

    if (complete) {
      setProgress((current) => Math.max(current, 92));
      queue(() => setProgress(100), 45);
      queue(() => setVisible(false), 300);
      queue(() => setProgress(0), 480);
      return () => {
        timersRef.current.forEach((timer) => window.clearTimeout(timer));
      };
    }

    setProgress(8);
    queue(() => setProgress(35), 60);
    queue(() => setProgress(70), 300);
    queue(() => setProgress(86), 780);

    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, [active, complete]);

  return (
    <div
      className={`h-[3px] w-full overflow-hidden bg-rose-50/40 transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      } ${className}`}
      aria-hidden="true"
    >
      <div
        className="h-full rounded-r-full bg-gradient-to-r from-[#FEE2E2] via-[#DC2626] to-[#FCA5A5] opacity-80 shadow-[0_0_14px_rgba(220,38,38,0.12)] transition-[width] duration-500 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

export function inferLoadingSkeletonVariant(message = "") {
  const text = String(message).toLowerCase();

  if (text.includes("follow")) return "follow-ups";
  if (text.includes("medicine")) return "medicine";
  if (text.includes("report")) return "reports";
  if (text.includes("patient details") || text.includes("patient profile")) {
    return "patient-details";
  }
  if (text.includes("health records")) return "health-records";
  if (text.includes("dashboard")) return "dashboard";
  if (
    text.includes("details") ||
    text.includes("detail") ||
    text.includes("feedback") ||
    text.includes("return slip")
  ) {
    return "details";
  }
  if (text.includes("form") || text.includes("referral details")) {
    return "form";
  }
  if (
    text.includes("patients") ||
    text.includes("records") ||
    text.includes("referrals") ||
    text.includes("accounts") ||
    text.includes("requests") ||
    text.includes("logs")
  ) {
    return "table";
  }

  return "module";
}

function SkeletonHeader({ compact = false }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <SkeletonBlock className={compact ? "h-4 w-36" : "h-5 w-44"} />
        <SkeletonBlock className="mt-2 h-3 w-72 max-w-full" />
      </div>
      <div className="flex gap-2">
        <SkeletonBlock className="h-9 w-24 rounded-lg" />
        <SkeletonBlock className="h-9 w-9 rounded-lg" />
      </div>
    </div>
  );
}

function ToolbarSkeleton({ action = true, filters = 2 }) {
  return (
    <div className={`${cardClass} p-3.5`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SkeletonBlock className="h-11 w-full max-w-xl rounded-lg" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: filters }).map((_, index) => (
            <SkeletonBlock key={index} className="h-10 w-28 rounded-lg" />
          ))}
          {action && <SkeletonBlock className="h-10 w-32 rounded-lg" />}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <SkeletonBlock className="h-6 w-24 rounded-full" />
        <SkeletonBlock className="h-6 w-28 rounded-full" />
      </div>
    </div>
  );
}

function TableShape({
  columns,
  rows = 6,
  minWidth = "min-w-[900px]",
  headerTitle = true,
  footer = true,
}) {
  const tracks = columns.map((column) => column.track || "minmax(0, 1fr)");

  return (
    <div className={`flex min-h-[360px] flex-col overflow-hidden ${cardClass}`}>
      {headerTitle && (
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <SkeletonBlock className="h-4 w-44" />
            <SkeletonBlock className="mt-2 h-3 w-72 max-w-full" />
          </div>
          <SkeletonBlock className="h-7 w-24 rounded-md" />
        </div>
      )}
      <div className="overflow-x-auto">
        <div className={`${minWidth}`}>
          <div
            className="grid gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3"
            style={{ gridTemplateColumns: tracks.join(" ") }}
          >
            {columns.map((column, index) => (
              <SkeletonBlock
                key={index}
                className={`h-3 ${column.header || "w-20"} ${
                  column.align === "right" ? "justify-self-end" : ""
                }`}
              />
            ))}
          </div>
          <div className="divide-y divide-slate-100">
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <div
                key={rowIndex}
                className="grid items-center gap-3 px-4 py-4"
                style={{ gridTemplateColumns: tracks.join(" ") }}
              >
                {columns.map((column, columnIndex) => (
                  <div
                    key={`${rowIndex}-${columnIndex}`}
                    className={column.align === "right" ? "justify-self-end" : ""}
                  >
                    {column.double ? (
                      <>
                        <SkeletonBlock className={`h-4 ${column.cell || "w-full"}`} />
                        <SkeletonBlock className="mt-2 h-3 w-20" />
                      </>
                    ) : (
                      <SkeletonBlock
                        className={`h-4 ${column.cell || column.header || "w-full"} ${
                          column.pill ? "rounded-full" : ""
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      {footer && (
        <div className="mt-auto flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <SkeletonBlock className="h-8 w-24 rounded-lg" />
          <SkeletonBlock className="h-8 w-8 rounded-lg" />
          <SkeletonBlock className="h-8 w-8 rounded-lg" />
        </div>
      )}
    </div>
  );
}

const followUpColumns = [
  { track: "minmax(220px, 1.4fr)", header: "w-16", cell: "w-40", double: true },
  { track: "minmax(160px, 0.85fr)", header: "w-24", cell: "w-28", pill: true },
  { track: "minmax(170px, 0.85fr)", header: "w-32", cell: "w-28" },
  { track: "minmax(120px, 0.6fr)", header: "w-16", cell: "w-20", pill: true },
  { track: "minmax(90px, 0.35fr)", header: "w-14", cell: "w-9", align: "right" },
];

const medicineColumns = [
  { track: "110px", header: "w-14", cell: "w-16", pill: true },
  { track: "minmax(220px, 1.3fr)", header: "w-36", cell: "w-44" },
  { track: "150px", header: "w-20", cell: "w-24", pill: true },
  { track: "150px", header: "w-28", cell: "w-24" },
  { track: "120px", header: "w-16", cell: "w-20", pill: true },
  { track: "130px", header: "w-20", cell: "w-24" },
  { track: "130px", header: "w-24", cell: "w-24" },
  { track: "minmax(160px, 1fr)", header: "w-16", cell: "w-32" },
  { track: "90px", header: "w-14", cell: "w-9", align: "right" },
];

const healthRecordColumns = [
  { track: "150px", header: "w-20", cell: "w-24", pill: true },
  { track: "minmax(220px, 1.4fr)", header: "w-24", cell: "w-44", double: true },
  { track: "150px", header: "w-24", cell: "w-24" },
  { track: "minmax(180px, 1fr)", header: "w-24", cell: "w-32", pill: true },
  { track: "130px", header: "w-20", cell: "w-20", pill: true },
  { track: "90px", header: "w-14", cell: "w-9", align: "right" },
];

const reportColumns = [
  { track: "minmax(220px, 1.4fr)", header: "w-28", cell: "w-44", double: true },
  { track: "150px", header: "w-20", cell: "w-24" },
  { track: "150px", header: "w-24", cell: "w-24", pill: true },
  { track: "150px", header: "w-24", cell: "w-20" },
  { track: "minmax(180px, 1fr)", header: "w-24", cell: "w-32" },
];

export function DashboardSkeleton({ message = "Loading dashboard..." }) {
  return (
    <SkeletonRoot message={message}>
      <SkeletonHeader />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className={`${cardClass} p-4`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="mt-3 h-7 w-24" />
              </div>
              <SkeletonBlock className="h-10 w-10 rounded-xl" />
            </div>
            <SkeletonBlock className="mt-4 h-2.5 w-32" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <div className={`${cardClass} p-4`}>
          <SkeletonBlock className="h-4 w-40" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        </div>
        <div className={`${cardClass} p-4`}>
          <SkeletonBlock className="h-4 w-32" />
          <SkeletonBlock className="mt-5 h-44 w-full rounded-xl" />
        </div>
      </div>
    </SkeletonRoot>
  );
}

export function TableSkeleton({
  message = "Loading records...",
  rows = 7,
  columns = 5,
}) {
  const columnConfig = Array.from({ length: columns }).map((_, index) => ({
    header: index === columns - 1 ? "w-14" : "w-20",
    cell:
      index === 0
        ? "w-28"
        : index === columns - 1
          ? "w-14"
          : "w-full",
    align: index === columns - 1 ? "right" : "",
  }));

  return (
    <SkeletonRoot message={message}>
      <SkeletonHeader compact />
      <TableShape columns={columnConfig} rows={rows} minWidth="min-w-[760px]" />
    </SkeletonRoot>
  );
}

export function FollowUpsSkeleton({ message = "Loading follow-ups..." }) {
  return (
    <SkeletonRoot message={message}>
      <ToolbarSkeleton filters={2} action={false} />
      <TableShape
        columns={followUpColumns}
        rows={6}
        minWidth="min-w-[900px]"
      />
    </SkeletonRoot>
  );
}

export function MedicineInventorySkeleton({
  message = "Loading medicine inventory...",
}) {
  return (
    <SkeletonRoot message={message}>
      <ToolbarSkeleton filters={3} action />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-fit items-center gap-1.5 rounded-lg bg-slate-100 p-1">
          <SkeletonBlock className="h-9 w-32 rounded-md" />
          <SkeletonBlock className="h-9 w-36 rounded-md" />
        </div>
        <SkeletonBlock className="h-8 w-32 rounded-md" />
      </div>
      <TableShape
        columns={medicineColumns}
        rows={7}
        minWidth="min-w-[1120px]"
      />
    </SkeletonRoot>
  );
}

export function ReportsSkeleton({ message = "Loading reports..." }) {
  return (
    <SkeletonRoot message={message}>
      <header>
        <SkeletonBlock className="h-6 w-28" />
        <SkeletonBlock className="mt-2 h-4 w-96 max-w-full" />
      </header>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="w-full max-w-sm">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="mt-2 h-10 w-full rounded-xl" />
        </div>
        <div className="flex flex-wrap gap-2">
          <SkeletonBlock className="h-10 w-24 rounded-lg" />
          <SkeletonBlock className="h-10 w-28 rounded-lg" />
          <SkeletonBlock className="h-10 w-20 rounded-lg" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className={`${cardClass} p-4`}>
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="mt-3 h-7 w-20" />
            <SkeletonBlock className="mt-3 h-2.5 w-32" />
          </div>
        ))}
      </div>
      <TableShape
        columns={reportColumns}
        rows={7}
        minWidth="min-w-[920px]"
      />
    </SkeletonRoot>
  );
}

export function PatientDetailsSkeleton({
  message = "Loading patient details...",
}) {
  return (
    <SkeletonRoot message={message}>
      <SkeletonBlock className="h-5 w-32" />
      <div className="grid min-w-0 gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className={`${cardClass} self-start p-5`}>
          <div className="flex flex-col items-center text-center">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="mt-4 h-6 w-44" />
            <SkeletonBlock className="mt-3 h-6 w-24 rounded-md" />
          </div>
          <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex justify-between gap-4">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="h-3 w-28" />
              </div>
            ))}
          </div>
        </aside>
        <section className="min-w-0">
          <div className="flex overflow-hidden">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock
                key={index}
                className="mr-1 h-11 w-32 rounded-t-xl rounded-b-none"
              />
            ))}
          </div>
          <div className={`${cardClass} rounded-tl-none p-5`}>
            {Array.from({ length: 3 }).map((_, sectionIndex) => (
              <div key={sectionIndex} className="mb-7 last:mb-0">
                <SkeletonBlock className="h-4 w-40" />
                <SkeletonBlock className="mt-2 h-3 w-72 max-w-full" />
                <div className="mt-4 grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div key={index}>
                      <SkeletonBlock className="h-3 w-24" />
                      <SkeletonBlock className="mt-2 h-4 w-full" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </SkeletonRoot>
  );
}

export function HealthRecordsSkeleton({
  message = "Loading health records...",
}) {
  return (
    <SkeletonRoot message={message}>
      <ToolbarSkeleton filters={2} action />
      <TableShape
        columns={healthRecordColumns}
        rows={7}
        minWidth="min-w-[980px]"
      />
    </SkeletonRoot>
  );
}

export function DetailsSkeleton({ message = "Loading details..." }) {
  return (
    <SkeletonRoot message={message}>
      <SkeletonHeader compact />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className={`${cardClass} p-5`}>
          <SkeletonBlock className="h-4 w-40" />
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index}>
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="mt-2 h-4 w-full" />
              </div>
            ))}
          </div>
          <SkeletonBlock className="mt-6 h-24 w-full rounded-xl" />
        </div>
        <div className={`${cardClass} p-5`}>
          <SkeletonBlock className="h-4 w-32" />
          <div className="mt-5 space-y-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index}>
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="mt-2 h-4 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonRoot>
  );
}

export function FormSkeleton({ message = "Loading form..." }) {
  return (
    <SkeletonRoot message={message}>
      <SkeletonHeader compact />
      <div className={`${cardClass} p-5`}>
        <SkeletonBlock className="h-4 w-44" />
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index}>
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="mt-2 h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <div className="mt-5">
          <SkeletonBlock className="h-3 w-28" />
          <SkeletonBlock className="mt-2 h-24 w-full rounded-lg" />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <SkeletonBlock className="h-10 w-24 rounded-lg" />
          <SkeletonBlock className="h-10 w-32 rounded-lg" />
        </div>
      </div>
    </SkeletonRoot>
  );
}

export function ModuleSkeleton({ message = "Loading..." }) {
  return (
    <SkeletonRoot message={message}>
      <SkeletonHeader compact />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`${cardClass} p-5 lg:col-span-2`}>
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="mt-5 h-56 w-full rounded-xl" />
        </div>
        <div className={`${cardClass} p-5`}>
          <SkeletonBlock className="h-4 w-32" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-8 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </SkeletonRoot>
  );
}

export function PageSkeletonLoader({
  message = "Loading...",
  variant,
  className = "",
}) {
  const supportedVariants = [
    "dashboard",
    "table",
    "details",
    "form",
    "module",
    "follow-ups",
    "medicine",
    "reports",
    "patient-details",
    "health-records",
  ];
  const requestedVariant = variant || inferLoadingSkeletonVariant(message);
  const skeletonVariant = supportedVariants.includes(requestedVariant)
    ? requestedVariant
    : "module";

  return (
    <div className={`min-w-0 ${className}`}>
      {skeletonVariant === "dashboard" && <DashboardSkeleton message={message} />}
      {skeletonVariant === "table" && <TableSkeleton message={message} />}
      {skeletonVariant === "details" && <DetailsSkeleton message={message} />}
      {skeletonVariant === "form" && <FormSkeleton message={message} />}
      {skeletonVariant === "module" && <ModuleSkeleton message={message} />}
      {skeletonVariant === "follow-ups" && <FollowUpsSkeleton message={message} />}
      {skeletonVariant === "medicine" && (
        <MedicineInventorySkeleton message={message} />
      )}
      {skeletonVariant === "reports" && <ReportsSkeleton message={message} />}
      {skeletonVariant === "patient-details" && (
        <PatientDetailsSkeleton message={message} />
      )}
      {skeletonVariant === "health-records" && (
        <HealthRecordsSkeleton message={message} />
      )}
    </div>
  );
}
