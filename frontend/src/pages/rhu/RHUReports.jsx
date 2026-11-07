import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { FileText, Printer } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  PageStateWrapper,
  RefreshingIndicator,
} from "../../components/common";
import BhcReportCharts from "../../components/features/reports/BhcReportCharts";
import BhcReportPeriodFilter from "../../components/features/reports/BhcReportPeriodFilter";
import RhuOverviewBento from "../../components/features/reports/RhuOverviewBento";
import { prepareBhcReportPeriod } from "../../utils/bhcReportPeriodFilter";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { getCurrentUser } from "../../utils/auth";
import {
  buildRhuReport,
  normalizeRhuReportCategory,
} from "../../utils/rhuReporting";
import { queryKeys } from "../../utils/queryKeys";
import { getAllHealthRecords } from "../../services/healthRecordService";
import { getAllPatients } from "../../services/patientService";
import { getAllReferrals } from "../../services/referrals";
import { listRhuVisits } from "../../services/rhuVisitService";

export default function RHUReports() {
  const user = getCurrentUser();
  const facilityName =
    user?.facility ||
    user?.facilityName ||
    user?.assignedRuralHealthUnit ||
    "Rural Health Unit";
  const [searchParams] = useSearchParams();
  const category = normalizeRhuReportCategory(searchParams.get("type"));
  const [appliedPeriod, setAppliedPeriod] = useState(() => {
    const initial = prepareBhcReportPeriod({ preset: "monthly" });
    return {
      selection: { ...initial.selection, ageGroup: "all" },
      period: initial.period,
    };
  });
  const period = appliedPeriod.period;
  const ageGroup = appliedPeriod.selection?.ageGroup || "all";
  const isOverview = category === "overview";
  const isNutrition = category === "nutrition";

  const {
    data: patients = [],
    isPending: patientsLoading,
    isFetching: patientsFetching,
    dataUpdatedAt: patientsUpdatedAt,
    error: patientsError,
    refetch: refetchPatients,
  } = useQuery({
    queryKey: [...queryKeys.patients("rhu"), "report-source"],
    queryFn: () => getAllPatients("rhu"),
    retry: false,
  });
  const {
    data: records = [],
    isPending: recordsLoading,
    isFetching: recordsFetching,
    dataUpdatedAt: recordsUpdatedAt,
    error: recordsError,
    refetch: refetchRecords,
  } = useQuery({
    queryKey: [...queryKeys.healthRecords("rhu"), "report-source"],
    queryFn: () => getAllHealthRecords("rhu"),
    retry: false,
  });
  const {
    data: referrals = [],
    isPending: referralsLoading,
    isFetching: referralsFetching,
    dataUpdatedAt: referralsUpdatedAt,
    error: referralsError,
    refetch: refetchReferrals,
  } = useQuery({
    queryKey: [...queryKeys.referrals("rhu"), "report-source"],
    queryFn: () => getAllReferrals(),
    retry: false,
  });
  const {
    data: visits = [],
    isPending: visitsLoading,
    isFetching: visitsFetching,
    dataUpdatedAt: visitsUpdatedAt,
    error: visitsError,
    refetch: refetchVisits,
  } = useQuery({
    queryKey: [...queryKeys.rhuVisits(), "report-source"],
    queryFn: () => listRhuVisits({ includeClosed: true }),
    retry: false,
  });

  const loading = patientsLoading || recordsLoading || referralsLoading || visitsLoading;
  const reportErrors = [patientsError, recordsError, referralsError, visitsError];
  const loadError = reportErrors.find(error => [401, 403].includes(error?.status)) || reportErrors.find(Boolean) || null;
  const refreshing =
    !loading && (patientsFetching || recordsFetching || referralsFetching || visitsFetching);
  const report = useMemo(
    () =>
      buildRhuReport({
        visits: Array.isArray(visits) ? visits : [],
        patients: Array.isArray(patients) ? patients : [],
        records: Array.isArray(records) ? records : [],
        referrals: Array.isArray(referrals) ? referrals : [],
        category,
        period,
        ageGroup,
      }),
    [visits, patients, records, referrals, category, period, ageGroup],
  );

  function retryReports() {
    refetchPatients();
    refetchRecords();
    refetchReferrals();
    refetchVisits();
  }

  return (
    <DashboardLayout role="rhu" title="Reports">
      <style>{`
        @page { size: landscape; margin: 12mm; }
        @media print {
          body * { visibility: hidden !important; }
          #rhu-report-print, #rhu-report-print * { visibility: visible !important; }
          #rhu-report-print { position: absolute; inset: 0; width: 100%; background: white !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <PageStateWrapper
        skeleton="reports"
        skeletonOptions={{ role: "rhu", category, cardCount: report.cards.length, chartCount: report.charts.length }}
        isLoading={loading}
        isError={Boolean(loadError)}
        isFetching={refreshing}
        hasData={
          patientsUpdatedAt > 0 &&
          recordsUpdatedAt > 0 &&
          referralsUpdatedAt > 0 &&
          visitsUpdatedAt > 0
        }
        error={loadError}
        onRetry={retryReports}
        loadingMessage="Loading reports..."
      >
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-[17px] font-bold tracking-tight text-ink-800">
                {isOverview
                  ? "Reports & Analytics"
                  : isNutrition
                    ? "Nutrition Report"
                    : report.categoryLabel}
              </h1>
              <p className="mt-1 text-[13px] text-neutral-600">
                {facilityName} · {period.label}
                {isNutrition && ageGroup !== "all" ? ` · Age ${ageGroup}` : ""}
              </p>
              {isNutrition ? (
                <p className="mt-1 max-w-2xl text-[12px] text-neutral-500">
                  Adult BMI categories apply only to assessments at age 18 or older. Younger patients are Not Applicable for status cards.
                </p>
              ) : null}
            </div>
            <div className="no-print flex flex-wrap items-center justify-end gap-2">
              <BhcReportPeriodFilter
                applied={appliedPeriod}
                onApply={setAppliedPeriod}
                includeAgeGroup={isNutrition}
              />
              <Button type="button" variant="secondary" size="compact" onClick={() => window.print()}>
                <FileText size={14} />
                Export PDF
              </Button>
              <Button type="button" variant="brand" size="compact" onClick={() => window.print()}>
                <Printer size={14} />
                Print
              </Button>
            </div>
          </header>

          {refreshing ? (
            <div className="no-print flex justify-end">
              <RefreshingIndicator label="Updating reports..." />
            </div>
          ) : null}

          {isOverview ? (
            <RhuOverviewBento report={report} periodLabel={period.label} className="anim-stagger" />
          ) : (
            <>
              <div className="anim-stagger no-print grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {report.cards.map((item) => (
                  <article key={item.key} className="rounded-card border border-neutral-200 bg-white p-4 shadow-card">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">{item.label}</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900">{item.value}</p>
                    <p className="mt-1 text-xs text-neutral-500">{item.hint}</p>
                  </article>
                ))}
              </div>

              <BhcReportCharts charts={report.charts} className="no-print" />

              <Card className="no-print rounded-card shadow-card">
                <CardHeader>
                  <CardTitle>Reporting summary</CardTitle>
                  <CardDescription>
                    Aggregate counts for {report.categoryLabel.toLowerCase()} · {period.label}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {report.summary.length === 0 || report.empty ? (
                    <p className="py-6 text-center text-sm text-neutral-500">
                      No matching records in this reporting period.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-neutral-200 bg-neutral-50 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                            <th className="px-3 py-2.5">Indicator</th>
                            <th className="px-3 py-2.5 text-right">Count</th>
                            <th className="px-3 py-2.5">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.summary.map((row, index) => (
                            <tr key={`${row.label}-${row.note}-${index}`} className="border-b border-neutral-100">
                              <td className="px-3 py-2.5 font-medium text-neutral-900">{row.label}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-neutral-900">{row.value}</td>
                              <td className="px-3 py-2.5 text-neutral-500">{row.note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          <PrintReport
            facilityName={facilityName}
            periodLabel={period.label}
            categoryLabel={isNutrition ? "Nutrition Report" : report.categoryLabel}
            cards={report.cards}
            summary={report.summary}
            notes={report.notes}
            ageGroup={isNutrition ? ageGroup : ""}
          />
        </div>
      </PageStateWrapper>
    </DashboardLayout>
  );
}

function PrintReport({ facilityName, periodLabel, categoryLabel, cards, summary, notes = [], ageGroup = "" }) {
  return (
    <section id="rhu-report-print" className="print-only">
      <h1 className="text-base font-bold text-neutral-900">AKAY RHU Reports</h1>
      <p className="mt-1 text-[12px] text-neutral-600">{facilityName}</p>
      <p className="mt-1 text-[12px] text-neutral-600">
        {categoryLabel} · {periodLabel}
        {ageGroup && ageGroup !== "all" ? ` · Age ${ageGroup}` : ""}
      </p>
      <p className="mt-1 text-[11px] text-neutral-500">
        Generated {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </p>
      {notes.length ? (
        <ul className="mt-3 list-disc pl-4 text-[11px] text-neutral-600">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      <table className="mt-4 w-full text-left text-[12px]">
        <thead>
          <tr>
            <th className="border-b border-neutral-300 py-1.5">Indicator</th>
            <th className="border-b border-neutral-300 py-1.5 text-right">Count</th>
            <th className="border-b border-neutral-300 py-1.5">Notes</th>
          </tr>
        </thead>
        <tbody>
          {(summary.length ? summary : cards).map((row, index) => (
            <tr key={`${row.label}-${row.note || row.hint}-${index}`}>
              <td className="border-b border-neutral-200 py-1.5">{row.label}</td>
              <td className="border-b border-neutral-200 py-1.5 text-right tabular-nums">{row.value}</td>
              <td className="border-b border-neutral-200 py-1.5">{row.note || row.hint}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
