import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { Button } from "../../../ui/button";
import { Input } from "../../../ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../ui/dropdown-menu";
import { SoftLoadingArea, RefreshingIndicator } from "../../../common";
import { DatePickerField } from "../../../common/forms/DatePickerField";
import HealthRecordsTable from "../../records/HealthRecordsTable";
import { DEFAULT_RECORD_FILTERS, DEFAULT_RECORD_VIEW, filterPatientRecords, patientRecordRows } from "../../../../utils/patientRecordHistory";
import { queryKeys } from "../../../../utils/queryKeys";
import { clampPage, pageCount, sliceRows } from "../../../../utils/tablePaging";

const NEXT_ACTIONS = [{ value: "", label: "All next actions" }, { value: "follow_up", label: "Follow-up Scheduled" }, { value: "referral", label: "RHU Referral" }, { value: "routine", label: "No Further Action" }];
const VISITS = [{ value: "", label: "All visit types" }, { value: "initial_consultation", label: "Initial Consultation" }, { value: "follow_up_visit", label: "Follow-up Visit" }];

function RecordFilter({ label, options, value, onChange }) {
  return (
    <div className="min-w-0 space-y-1 text-xs text-neutral-600">
      <span>{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" aria-label={label} className="h-9 w-full justify-between rounded-md border border-neutral-300 bg-white px-3 text-xs text-neutral-900">
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

export default function PatientRecordsTab({ patientId, records = [], referrals, followUps, isLoading, isFetching, isError, hasData = records.length > 0, error, onRetry, detailsState, role = "bhc", basePath = "/bhc" }) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.patientRecordView(role, patientId);
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

  if (isLoading && !hasData && ![401, 403].includes(error?.status)) {
    return (
      <section aria-label="Health Records" className="space-y-3 p-4">
        <SoftLoadingArea skeleton="health-records" bodyOnly skeletonOptions={{ toolbar: true, minWidth: 760 }} isLoading message="Loading health records..." minHeight="min-h-[320px]" />
      </section>
    );
  }

  return (
    <section aria-label="Health Records" className="space-y-3 p-4">
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(180px,2fr)_repeat(4,minmax(130px,1fr))_auto]">
        <label className="space-y-1 text-xs text-neutral-600">Search
          <Input type="search" aria-label="Search health records" value={filters.search} onChange={event => changeFilters({ search: event.target.value })} placeholder="Record ID or chief complaint" className="h-9 text-xs sm:text-xs" />
        </label>
        <DatePickerField
          label="Date from"
          name="dateFrom"
          value={filters.dateFrom}
          allowClear
          onChange={(dateFrom) => changeFilters({ dateFrom })}
        />
        <DatePickerField
          label="Date to"
          name="dateTo"
          value={filters.dateTo}
          allowClear
          error={dateError}
          onChange={(dateTo) => changeFilters({ dateTo })}
        />
        <RecordFilter label="Next Action" options={NEXT_ACTIONS} value={filters.outcome} onChange={outcome => changeFilters({ outcome })} />
        <RecordFilter label="Visit Type" options={VISITS} value={filters.visitType} onChange={visitType => changeFilters({ visitType })} />
        <Button variant="ghost" size="sm" onClick={() => queryClient.setQueryData(queryKey, { filters: { ...DEFAULT_RECORD_FILTERS }, page: 1 })} className="h-9 border border-neutral-300 text-xs text-neutral-900">Clear</Button>
      </div>
      {isError && (!hasData || [401, 403].includes(error?.status)) ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white p-4 text-sm text-neutral-900">
          Unable to load health records.<Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button>
        </div>
      ) : (
        <>
          {isError && hasData && <p role="status" className="text-sm text-neutral-600">Unable to refresh health records. Showing the last history that loaded.</p>}
          {isFetching && <RefreshingIndicator label="Updating health records..." />}
          <HealthRecordsTable records={sliceRows(filtered, page)} currentPage={page} totalPages={totalPages} onPageChange={next => queryClient.setQueryData(queryKey, current => ({ ...current, page: next }))} detailsState={detailsState} emptyTitle={records.length ? "No matching records" : "No health records yet"} basePath={basePath} />
        </>
      )}
    </section>
  );
}
