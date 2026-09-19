import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getPatients } from "../services/patients";
import { getPatientSex } from "../utils/patientUtils";
import { queryKeys } from "../utils/queryKeys";

export default function usePatients(role = "bhc") {
  /* ─────────────────────────────────────────────
   * State
   * ───────────────────────────────────────────── */
  const [filters, setFilters] = useState({
    search: "",
    sex: "All",
    barangay: "All Barangays",
    ageGroup: "All Age Groups",
    civilStatus: "All Civil Status",
    dateRegistered: "",
  });

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
    retry: false,
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
        filters.sex === "All" || getPatientSex(patient) === filters.sex;

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
   * Return
   * ───────────────────────────────────────────── */
  return {
    patients,
    filteredPatients,

    loading,
    error,
    queryError,
    refetchPatients: refetch,
    isRefreshing: isFetching && !loading,

    filters,
    setFilters,
  };
}
