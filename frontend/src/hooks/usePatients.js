import { useDeferredValue, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { listPatientsPage } from "../services/patientService";
import { queryKeys } from "../utils/queryKeys";
import { PATIENTS_LOAD_BATCH } from "../utils/tablePaging";

const DEFAULT_FILTERS = {
  search: "",
  sex: "All",
  barangay: "All Barangays",
  ageGroup: "All Age Groups",
  civilStatus: "All Civil Status",
  dateRegistered: "",
};

function directoryParams(filters, page) {
  return {
    page,
    per_page: PATIENTS_LOAD_BATCH,
    // Facets only on page 1 so Load More / report-style crawls stay cheap.
    include_filter_options: page === 1 ? 1 : undefined,
    search: String(filters.search || "").trim() || undefined,
    sex: filters.sex !== "All" ? filters.sex : undefined,
    barangay: filters.barangay !== "All Barangays" ? filters.barangay : undefined,
    civil_status: filters.civilStatus !== "All Civil Status" ? filters.civilStatus : undefined,
    age_group:
      filters.ageGroup && filters.ageGroup !== "All Age Groups"
        ? filters.ageGroup
        : undefined,
    date_registered: filters.dateRegistered || undefined,
  };
}

function dedupePatients(pages = []) {
  const byId = new Map();
  for (const page of pages) {
    for (const patient of page.items || []) {
      const id = String(patient.id || patient.patientId || patient.patient_id || "");
      if (!id) continue;
      byId.set(id, patient);
    }
  }
  return [...byId.values()];
}

export default function usePatients(role = "bhc") {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  // Keep typing snappy; the directory query follows the deferred search value.
  const deferredSearch = useDeferredValue(filters.search);
  const queryFilters = useMemo(
    () => ({ ...filters, search: deferredSearch }),
    [filters, deferredSearch],
  );

  const {
    data,
    isPending,
    isFetching,
    isFetchingNextPage,
    error: queryError,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: [...queryKeys.patients(role), "directory", queryFilters],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => listPatientsPage(directoryParams(queryFilters, pageParam)),
    getNextPageParam: (lastPage) => {
      const current = Number(lastPage?.meta?.current_page) || 1;
      const last = Number(lastPage?.meta?.last_page) || 1;
      return current < last ? current + 1 : undefined;
    },
    retry: false,
  });

  const patients = useMemo(() => dedupePatients(data?.pages || []), [data]);
  const total = useMemo(() => {
    const pages = data?.pages || [];
    if (!pages.length) return 0;
    return Number(pages[pages.length - 1]?.meta?.total) || patients.length;
  }, [data, patients.length]);

  const filterOptions = useMemo(() => {
    const pages = data?.pages || [];
    for (const page of pages) {
      if (page?.filterOptions) return page.filterOptions;
    }
    return { barangays: [], civilStatuses: [] };
  }, [data]);

  const loading = isPending && patients.length === 0;
  const error = queryError ? "Unable to load patients" : "";

  // Server already applied search/filters; keep the name for PatientsModule.
  const filteredPatients = patients;

  async function loadMore() {
    if (!hasNextPage || isFetchingNextPage) return;
    await fetchNextPage();
  }

  return {
    patients,
    // Empty first page still counts as loaded (show "No patients yet", not the skeleton).
    hasData: data != null,
    filteredPatients,
    total,
    hasMore: Boolean(hasNextPage),
    loadMore,
    loadingMore: isFetchingNextPage,
    filterOptions,

    loading,
    error,
    queryError,
    refetchPatients: refetch,
    isRefreshing: isFetching && !loading && !isFetchingNextPage,

    filters,
    setFilters,
  };
}
