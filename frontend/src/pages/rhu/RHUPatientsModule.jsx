import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { ModuleToolbar, SoftLoadingArea } from "../../components/common";
import { DottedSpinner } from "../../components/common/loading/SoftLoadingOverlay";
import PatientDirectoryCard from "../../components/features/patients/PatientDirectoryCard";
import { getRhuPatients } from "../../services/patientService";
import {
  formatDisplayValue,
  formatPatientName,
} from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";

const PATIENTS_BATCH_SIZE = 12;

const DEFAULT_FILTERS = {
  search: "",
  barangay: "All Barangays",
  sex: "All",
  ageGroup: "All Age Groups",
  civilStatus: "All Civil Status",
  dateRegistered: "",
};

function uniqueOptions(items, selectors, fallback) {
  const values = items
    .flatMap((item) => selectors.map((selector) => selector(item)))
    .map((value) => formatDisplayValue(value, ""))
    .filter(Boolean);

  return [fallback, ...new Set(values)];
}

function normalizeDate(value) {
  if (!value) return "";

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toISOString().slice(0, 10);
}

function getPatientSex(patient) {
  if (patient.sex) return formatDisplayValue(patient.sex, "");

  const ageSex = (patient.ageSex || "").toLowerCase();

  if (ageSex.endsWith("/f") || ageSex.includes("female")) return "Female";
  if (ageSex.endsWith("/m") || ageSex.includes("male")) return "Male";

  return "";
}

function getPatientAge(patient) {
  const rawAge = patient.age || patient.ageSex || "";
  const match = rawAge.toString().match(/\d+/);

  return match ? Number(match[0]) : null;
}

function getPatientContact(patient) {
  return formatDisplayValue(
    patient.contact ||
      patient.contactNumber ||
      patient.phone ||
      patient.mobileNumber,
    "",
  );
}

function getPatientBarangay(patient) {
  return formatDisplayValue(
    patient.barangay ||
      patient.barangayName ||
      patient.addressBarangay ||
      patient.address?.barangay,
    "",
  );
}

function getRegisteredDate(patient) {
  return normalizeDate(
    patient.dateRegistered ||
      patient.date_registered ||
      patient.createdAt ||
      patient.registeredAt,
  );
}

export default function Patients() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [visibleCount, setVisibleCount] = useState(PATIENTS_BATCH_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRef = useRef(null);

  const {
    data: patientsData = [],
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.patients("rhu"),
    queryFn: getRhuPatients,
  });

  const allPatients = useMemo(
    () => (Array.isArray(patientsData) ? patientsData : []),
    [patientsData],
  );

  const loading = isLoading && allPatients.length === 0;
  const refreshing = isFetching && allPatients.length > 0;

  const barangayOptions = uniqueOptions(
    allPatients,
    [(patient) => getPatientBarangay(patient)],
    "All Barangays",
  );

  const civilStatusOptions = uniqueOptions(
    allPatients,
    [(patient) => patient.civilStatus],
    "All Civil Status",
  );

  const filteredPatients = useMemo(() => {
    const query = filters.search.trim().toLowerCase();

    return allPatients.filter((patient) => {
      const sex = getPatientSex(patient);
      const age = getPatientAge(patient);
      const contact = getPatientContact(patient);
      const barangay = getPatientBarangay(patient);
      const registeredDate = getRegisteredDate(patient);

      const searchText = [
        patient.id,
        patient.patientId,
        formatPatientName(patient, ""),
        contact,
        barangay,
        patient.email,
        patient.civilStatus,
        registeredDate,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !query || searchText.includes(query);

      const matchesBarangay =
        filters.barangay === "All Barangays" ||
        barangay === filters.barangay;

      const matchesSex = filters.sex === "All" || sex === filters.sex;

      const matchesAgeGroup =
        filters.ageGroup === "All Age Groups" ||
        (filters.ageGroup === "Child" && age !== null && age <= 17) ||
        (filters.ageGroup === "Adult" &&
          age !== null &&
          age >= 18 &&
          age <= 59) ||
        (filters.ageGroup === "Senior" && age !== null && age >= 60);

      const matchesCivilStatus =
        filters.civilStatus === "All Civil Status" ||
        patient.civilStatus === filters.civilStatus;

      const matchesDate =
        !filters.dateRegistered || registeredDate === filters.dateRegistered;

      return (
        matchesSearch &&
        matchesBarangay &&
        matchesSex &&
        matchesAgeGroup &&
        matchesCivilStatus &&
        matchesDate
      );
    });
  }, [allPatients, filters]);

  const activeFilters = [
    filters.barangay !== "All Barangays" && {
      key: "barangay",
      label: filters.barangay,
    },
    filters.sex !== "All" && { key: "sex", label: filters.sex },
    filters.ageGroup !== "All Age Groups" && {
      key: "ageGroup",
      label: filters.ageGroup,
    },
    filters.civilStatus !== "All Civil Status" && {
      key: "civilStatus",
      label: filters.civilStatus,
    },
    filters.dateRegistered && {
      key: "dateRegistered",
      label: filters.dateRegistered,
    },
  ].filter(Boolean);

  const activeFilterCount = activeFilters.filter(
    (filter) => filter.key !== "search",
  ).length;

  const hasAnyFilter = activeFilters.length > 0 || Boolean(filters.search);
  const visiblePatients = filteredPatients.slice(0, visibleCount);
  const hasMorePatients = visibleCount < filteredPatients.length;

  useEffect(() => {
    setVisibleCount(PATIENTS_BATCH_SIZE);
    setLoadingMore(false);
  }, [filters]);

  useEffect(() => {
    if (!loadMoreRef.current || !hasMorePatients || loadingMore) {
      return undefined;
    }

    let loadTimer;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;

        setLoadingMore(true);

        loadTimer = window.setTimeout(() => {
          setVisibleCount((current) =>
            Math.min(current + PATIENTS_BATCH_SIZE, filteredPatients.length),
          );
          setLoadingMore(false);
        }, 220);
      },
      { rootMargin: "240px 0px" },
    );

    observer.observe(loadMoreRef.current);

    return () => {
      observer.disconnect();
      if (loadTimer) window.clearTimeout(loadTimer);
    };
  }, [filteredPatients.length, hasMorePatients, loadingMore]);

  function applyDropdownFilters(nextFilters) {
    setFilters((prev) => ({ ...prev, ...nextFilters }));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  function removeFilter(key) {
    const resetValues = {
      search: "",
      barangay: "All Barangays",
      sex: "All",
      ageGroup: "All Age Groups",
      civilStatus: "All Civil Status",
      dateRegistered: "",
    };

    setFilters((prev) => ({ ...prev, [key]: resetValues[key] }));
  }

  const dropdownFilters = [
    {
      key: "barangay",
      label: "Barangay",
      value: filters.barangay,
      options: barangayOptions,
    },
    {
      key: "sex",
      label: "Sex",
      value: filters.sex,
      options: ["All", "Male", "Female"],
    },
    {
      key: "ageGroup",
      label: "Age Group",
      value: filters.ageGroup,
      options: ["All Age Groups", "Child", "Adult", "Senior"],
    },
    {
      key: "civilStatus",
      label: "Civil Status",
      value: filters.civilStatus,
      options: civilStatusOptions,
    },
    {
      key: "dateRegistered",
      label: "Date Registered",
      value: filters.dateRegistered,
      type: "date",
    },
  ];

  return (
    <DashboardLayout role="rhu" title="Patients">
      <SoftLoadingArea
        isLoading={loading}
        message="Loading patients..."
        scope="area"
        className="space-y-4"
      >
        {!loading && (
          <ModuleToolbar
            searchValue={filters.search}
            onSearchChange={(value) =>
              setFilters((prev) => ({ ...prev, search: value }))
            }
            searchPlaceholder="Search by name, ID, contact, or barangay..."
            filters={dropdownFilters}
            activeFilterCount={activeFilterCount}
            activeFilters={activeFilters}
            onApplyFilters={applyDropdownFilters}
            onClearFilters={clearFilters}
            onRemoveFilter={removeFilter}
            filterDescription="Narrow the patient directory."
            primaryActionTo="/rhu/patients/add"
            primaryActionLabel="New Patient"
            primaryActionIcon={<Plus size={14} strokeWidth={2.5} />}
          />
        )}

        <div className="relative min-w-0">
          {!loading && (
            <RHUPatientsDirectory
              patients={visiblePatients}
              hasAnyFilter={hasAnyFilter}
              hasMorePatients={hasMorePatients}
              loadingMore={loadingMore}
              loadMoreRef={loadMoreRef}
              refreshing={refreshing}
            />
          )}
        </div>
      </SoftLoadingArea>
    </DashboardLayout>
  );
}

function RHUPatientsDirectory({
  patients,
  hasAnyFilter,
  hasMorePatients,
  loadingMore,
  loadMoreRef,
  refreshing,
}) {
  return (
    <section className="anim-fade-up">
      <div className="relative min-w-0">
        {refreshing && (
          <div className="pointer-events-none absolute right-0 top-0 z-10 rounded-full border border-red-100 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#B91C1C] shadow-sm">
            Refreshing
          </div>
        )}

        {patients.length === 0 ? (
          <PatientDirectoryState
            icon={<Users size={22} className="text-[#94A3B8]" />}
            title={hasAnyFilter ? "No patients found." : "No patients yet."}
            description={
              hasAnyFilter
                ? "Try another search or filter."
                : "Tap New Patient to start."
            }
            action={
              !hasAnyFilter && (
                <Link
                  to="/rhu/patients/add"
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B]"
                >
                  <Plus size={13} />
                  New Patient
                </Link>
              )
            }
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {patients.map((patient) => (
                <PatientDirectoryCard
                  key={patient.id || patient.patientId}
                  patient={patient}
                  basePath="/rhu"
                />
              ))}
            </div>

            {(loadingMore || hasMorePatients) && (
              <div ref={loadMoreRef} className="mt-3">
                {loadingMore ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-5">
                    <DottedSpinner label="Loading more patients" />
                    <span className="text-[11px] font-medium text-[#94A3B8]">
                      Loading more patients...
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-center py-3">
                    <span className="text-[11px] font-medium text-[#94A3B8]">
                      Scroll to load more patients
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function PatientDirectoryState({ icon, title, description, action }) {
  return (
    <div className="px-6 py-20 text-center">
      <div className="flex flex-col items-center justify-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9]">
          {icon}
        </div>
        <p className="text-[13px] font-semibold text-[#334155]">{title}</p>
        <p className="mt-1 text-[11.5px] text-[#94A3B8]">{description}</p>
        {action}
      </div>
    </div>
  );
}
