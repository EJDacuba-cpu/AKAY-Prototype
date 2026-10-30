import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { FileText, Printer } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  DatePickerField,
  PageStateWrapper,
  RefreshingIndicator,
  SegmentedFilter,
} from "../../components/common";
import BhcReportCharts from "../../components/features/reports/BhcReportCharts";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { getCurrentUser } from "../../utils/auth";
import {
  PERIOD_PRESETS,
  REPORT_CATEGORIES,
  buildBhcReport,
  normalizeReportCategory,
  resolveReportPeriod,
} from "../../utils/bhcReporting";
import { queryKeys } from "../../utils/queryKeys";
import { getAllHealthRecords } from "../../services/healthRecordService";
import { getAllPatients } from "../../services/patientService";
import { getAllReferrals } from "../../services/referrals";

export default function BHCReports() {
  const user = getCurrentUser();
  const facilityName = user?.facility || user?.assignedBarangayHealthCenter || "Barangay Health Center";
  const [searchParams, setSearchParams] = useSearchParams();
  const category = normalizeReportCategory(searchParams.get("type"));
  const [periodPreset, setPeriodPreset] = useState("monthly");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const period = useMemo(
    () => resolveReportPeriod({ preset: periodPreset, from: customFrom, to: customTo }),
    [periodPreset, customFrom, customTo],
  );

  const {
    data: patients = [],
    isLoading: patientsLoading,
    isFetching: patientsFetching,
    dataUpdatedAt: patientsUpdatedAt,
    error: patientsError,
    refetch: refetchPatients,
  } = useQuery({
    queryKey: [...queryKeys.patients("bhc"), "report-source"],
    queryFn: () => getAllPatients("bhc"),
    retry: false,
  });
  const {
    data: records = [],
    isLoading: recordsLoading,
    isFetching: recordsFetching,
    dataUpdatedAt: recordsUpdatedAt,
    error: recordsError,
    refetch: refetchRecords,
  } = useQuery({
    queryKey: [...queryKeys.healthRecords("bhc"), "report-source"],
    queryFn: () => getAllHealthRecords("bhc"),
    retry: false,
  });
  const {
    data: referrals = [],
    isLoading: referralsLoading,
    isFetching: referralsFetching,
    dataUpdatedAt: referralsUpdatedAt,
    error: referralsError,
    refetch: refetchReferrals,
  } = useQuery({
    queryKey: [...queryKeys.referrals("bhc"), "report-source"],
    queryFn: () => getAllReferrals(),
    retry: false,
  });

  const loading = patientsLoading || recordsLoading || referralsLoading;
  const loadError = patientsError || recordsError || referralsError || null;
  const refreshing = !loading && (patientsFetching || recordsFetching || referralsFetching);
  const report = useMemo(
    () =>
      buildBhcReport({
        patients: Array.isArray(patients) ? patients : [],
        records: Array.isArray(records) ? records : [],
        referrals: Array.isArray(referrals) ? referrals : [],
        category,
        period,
      }),
    [patients, records, referrals, category, period],
  );

  function selectCategory(slug) {
    setSearchParams({ type: slug });
  }

  function retryReports() {
    refetchPatients();
    refetchRecords();
    refetchReferrals();
  }

  return (
    <DashboardLayout role="bhc" title="Reports">
      <style>{`
        @page { size: landscape; margin: 12mm; }
        @media print {
          body * { visibility: hidden !important; }
          #bhc-report-print, #bhc-report-print * { visibility: visible !important; }
          #bhc-report-print { position: absolute; inset: 0; width: 100%; background: white !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <PageStateWrapper
        skeleton="reports"
        isLoading={loading}
        isError={Boolean(loadError)}
        isFetching={refreshing}
        hasData={patientsUpdatedAt > 0 && recordsUpdatedAt > 0 && referralsUpdatedAt > 0}
        error={loadError}
        onRetry={retryReports}
        loadingMessage="Loading reports..."
      >
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-xl font-bold text-neutral-900">Reports & Analytics</h1>
              <p className="mt-1 text-sm text-neutral-500">
                {facilityName} · {period.label}
              </p>
            </div>
            <div className="no-print flex flex-wrap items-center gap-2">
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

          <div className="no-print flex flex-col gap-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <SegmentedFilter
                label="Reporting period"
                visibleLabel="Reporting period"
                value={periodPreset}
                onChange={setPeriodPreset}
                options={PERIOD_PRESETS}
              />
              {periodPreset === "custom" ? (
                <div className="flex flex-wrap items-end gap-3">
                  <DatePickerField
                    label="From"
                    name="report-from"
                    value={customFrom}
                    onChange={setCustomFrom}
                    disableFuture
                  />
                  <DatePickerField
                    label="To"
                    name="report-to"
                    value={customTo}
                    onChange={setCustomTo}
                    disableFuture
                  />
                  {!customFrom ? (
                    <p className="pb-2 text-xs text-neutral-500">Choose a start date for the custom range.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="-mx-1 overflow-x-auto px-1">
              <SegmentedFilter
                label="Report category"
                value={REPORT_CATEGORIES.find((item) => item.key === category)?.slug || "all"}
                onChange={selectCategory}
                wrap
                options={REPORT_CATEGORIES.map((item) => ({ value: item.slug, label: item.label }))}
              />
            </div>
          </div>

          {refreshing ? (
            <div className="no-print flex justify-end">
              <RefreshingIndicator label="Updating reports..." />
            </div>
          ) : null}

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

          <PrintReport
            facilityName={facilityName}
            periodLabel={period.label}
            categoryLabel={report.categoryLabel}
            cards={report.cards}
            summary={report.summary}
          />
        </div>
      </PageStateWrapper>
    </DashboardLayout>
  );
}

function PrintReport({ facilityName, periodLabel, categoryLabel, cards, summary }) {
  return (
    <section id="bhc-report-print" className="print-only">
      <h1 className="text-base font-bold text-neutral-900">AKAY BHC Reports</h1>
      <p className="mt-1 text-[12px] text-neutral-600">{facilityName}</p>
      <p className="mt-1 text-[12px] text-neutral-600">
        {categoryLabel} · {periodLabel}
      </p>
      <p className="mt-1 text-[11px] text-neutral-500">
        Generated {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </p>
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
