import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getPatients } from "../services/patients";
import { queryKeys } from "../utils/queryKeys";

export default function usePatients(role = "bhc") {
  /* ─────────────────────────────────────────────
   * State
   * ───────────────────────────────────────────── */
  const [currentPage, setCurrentPage] = useState(1);

  const [filters, setFilters] = useState({
    search: "",
    sex: "All",
    barangay: "All Barangays",
    ageGroup: "All Age Groups",
    civilStatus: "All Civil Status",
    dateRegistered: "",
  });

  const itemsPerPage = 10;

  function getPatientAge(patient) {
    if (typeof patient.age === "number") return patient.age;

    const rawAge =
      patient.age ||
      String(patient.ageSex || "")
        .split("/")
        .at(0);
    const parsed = parseInt(rawAge, 10);

    return Number.isNaN(parsed) ? null : parsed;
  }

  function matchesAgeGroup(patient, ageGroup) {
    if (ageGroup === "All Age Groups") return true;

    const age = getPatientAge(patient);
    if (age === null) return false;

    if (ageGroup === "Child") return age <= 17;
    if (ageGroup === "Adult") return age >= 18 && age <= 59;
    if (ageGroup === "Senior") return age >= 60;

    return true;
  }

  function getDateValue(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toISOString().slice(0, 10);
  }

  /* ─────────────────────────────────────────────
   * Fetch Patients
   * ───────────────────────────────────────────── */
  const {
    data: patientsData = [],
    isLoading,
    isFetching,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.patients(role),
    queryFn: getPatients,
  });

  const patients = useMemo(
    () => (Array.isArray(patientsData) ? patientsData : []),
    [patientsData],
  );
  const loading = isLoading && patients.length === 0;
  const error = queryError ? "Unable to load patients" : "";

  /* ─────────────────────────────────────────────
   * Filter Logic
   * ───────────────────────────────────────────── */
  const filteredPatients = useMemo(() => {
    return patients.filter((patient) => {
      const query = filters.search.toLowerCase();
      const searchable = [
        patient.name,
        patient.id,
        patient.patientId,
        patient.patient_id,
        patient.barangay,
        patient.assignedBhc,
        patient.assignedBHC,
        patient.contact,
        patient.contactNumber,
        patient.philHealthNumber,
        patient.philhealthNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !query || searchable.includes(query);

      const matchesSex =
        filters.sex === "All" ||
        (patient.ageSex || "")
          .toLowerCase()
          .includes(filters.sex === "Male" ? "/m" : "/f");

      const matchesBarangay =
        filters.barangay === "All Barangays" ||
        patient.barangay === filters.barangay ||
        patient.assignedBhc === filters.barangay ||
        patient.assignedBHC === filters.barangay;

      const matchesAge = matchesAgeGroup(patient, filters.ageGroup);

      const matchesCivilStatus =
        filters.civilStatus === "All Civil Status" ||
        patient.civilStatus === filters.civilStatus;

      const registeredDate = getDateValue(
        patient.dateRegistered || patient.createdAt || patient.registeredAt,
      );
      const matchesDate =
        !filters.dateRegistered || registeredDate === filters.dateRegistered;

      return (
        matchesSearch &&
        matchesSex &&
        matchesBarangay &&
        matchesAge &&
        matchesCivilStatus &&
        matchesDate
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients, filters]);

  /* ─────────────────────────────────────────────
   * Pagination
   * ───────────────────────────────────────────── */
  const totalPages = Math.ceil(filteredPatients.length / itemsPerPage);

  const paginatedPatients = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;

    const endIndex = startIndex + itemsPerPage;

    return filteredPatients.slice(startIndex, endIndex);
  }, [filteredPatients, currentPage, itemsPerPage]);

  /* Reset page when filters change */
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  /* Prevent page overflow */
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  /* ─────────────────────────────────────────────
   * Statistics
   * ───────────────────────────────────────────── */
  const stats = useMemo(
    () => ({
      totalPatients: patients.length,
    }),
    [patients],
  );

  /* ─────────────────────────────────────────────
   * Return
   * ───────────────────────────────────────────── */
  return {
    patients,
    filteredPatients,
    paginatedPatients,

    loading,
    error,
    refetchPatients: refetch,
    isRefreshing: isFetching && !loading,

    filters,
    setFilters,

    stats,

    currentPage,
    setCurrentPage,

    totalPages,
    itemsPerPage,
  };
}
