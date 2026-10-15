import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { Button } from "../../../ui/button";
import { Input } from "../../../ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../ui/dropdown-menu";
import { SoftLoadingArea, RefreshingIndicator } from "../../../common";
import HealthRecordsTable from "../../records/HealthRecordsTable";
import { DEFAULT_RECORD_FILTERS, DEFAULT_RECORD_VIEW, filterPatientRecords, patientRecordRows } from "../../../../utils/patientRecordHistory";
import { queryKeys } from "../../../../utils/queryKeys";
import { clampPage, pageCount, sliceRows } from "../../../../utils/tablePaging";

const OUTCOMES = [{ value: "", label: "All outcomes" }, { value: "follow_up", label: "BHC Follow-up" }, { value: "referral", label: "RHU Referral" }, { value: "routine", label: "Routine" }];
const VISITS = [{ value: "", label: "All visit types" }, { value: "initial_consultation", label: "Initial Consultation" }, { value: "follow_up_visit", label: "Follow-up Visit" }];

function RecordFilter({ label, options, value, onChange }) {
  return (
    <div className="min-w-0 space-y-1 text-xs text-slate-600">
      <span>{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" aria-label={label} className="h-9 w-full justify-between rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900">
            {options.find(option => option.value === value)?.label}<ChevronDown size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {options.map(option => <DropdownMenuItem key={option.value} onSelect={() => onChange(option.value)} aria-current={value === option.value ? "true" : undefined}>{option.label}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function PatientRecordsTab({ patientId, records = [], referrals = [], followUps = [], isLoading, isFetching, isError, onRetry, detailsState }) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.patientRecordView("bhc", patientId);
  // Session memory only: search can contain a complaint, so never put it in the URL or browser storage.
  const { data: view } = useQuery({ queryKey, queryFn: () => DEFAULT_RECORD_VIEW, initialData: DEFAULT_RECORD_VIEW, enabled: false, gcTime: 30 * 60 * 1000 });
  const { filters } = view;
  const rows = useMemo(() => patientRecordRows(records, referrals, followUps), [records, referrals, followUps]);
  const dateError = filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo ? "End date must be on or after the start date." : "";
  const filtered = useMemo(() => filterPatientRecords(rows, filters), [rows, filters]);
  const totalPages = pageCount(filtered.length);
  const page = clampPage(view.page, totalPages);

  function changeFilters(patch) {
    queryClient.setQueryData(queryKey, current => ({ filters: { ...current.filters, ...patch }, page: 1 }));
  }

  return (
    <section aria-label="Health Records" className="space-y-3 p-4">
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(180px,2fr)_repeat(4,minmax(130px,1fr))_auto]">
        <label className="space-y-1 text-xs text-slate-600">Search
          <Input type="search" aria-label="Search health records" value={filters.search} onChange={event => changeFilters({ search: event.target.value })} placeholder="Record ID or chief complaint" className="h-9 text-xs sm:text-xs" />
        </label>
        <label className="space-y-1 text-xs text-slate-600">Date from
          <Input type="date" value={filters.dateFrom} onChange={event => changeFilters({ dateFrom: event.target.value })} className="h-9 text-xs sm:text-xs" />
        </label>
        <label className="space-y-1 text-xs text-slate-600">Date to
          <Input type="date" value={filters.dateTo} aria-invalid={Boolean(dateError)} aria-describedby={dateError ? "record-date-error" : undefined} onChange={event => changeFilters({ dateTo: event.target.value })} className="h-9 text-xs sm:text-xs" />
        </label>
        <RecordFilter label="Outcome" options={OUTCOMES} value={filters.outcome} onChange={outcome => changeFilters({ outcome })} />
        <RecordFilter label="Visit Type" options={VISITS} value={filters.visitType} onChange={visitType => changeFilters({ visitType })} />
        <Button variant="ghost" size="sm" onClick={() => queryClient.setQueryData(queryKey, { filters: { ...DEFAULT_RECORD_FILTERS }, page: 1 })} className="h-9 border border-slate-300 text-xs text-slate-900">Clear</Button>
      </div>
      {dateError && <p id="record-date-error" role="alert" className="text-xs text-slate-900">{dateError}</p>}
      {isError ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-900">
          Unable to load health records.<Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button>
        </div>
      ) : isLoading ? (
        <SoftLoadingArea skeleton="health-records" isLoading message="Loading health records..." minHeight="min-h-[320px]"><div className="min-h-[320px]" /></SoftLoadingArea>
      ) : (
        <>
          {isFetching && <RefreshingIndicator label="Updating health records..." />}
          <HealthRecordsTable records={sliceRows(filtered, page)} currentPage={page} totalPages={totalPages} onPageChange={next => queryClient.setQueryData(queryKey, current => ({ ...current, page: next }))} detailsState={detailsState} emptyTitle={records.length ? "No matching records" : "No health records yet"} />
        </>
      )}
    </section>
  );
}
