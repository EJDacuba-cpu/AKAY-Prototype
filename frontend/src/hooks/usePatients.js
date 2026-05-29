import { useEffect, useMemo, useState } from "react";

import { getPatients } from "../services/patients";

export default function usePatients() {
  /* ─────────────────────────────────────────────
   * State
   * ───────────────────────────────────────────── */
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);

  const [filters, setFilters] = useState({
    search: "",
    sex: "All",
    type: "All Patients",
  });

  const itemsPerPage = 10;

  function matchesPatientType(patient, filterType) {
    if (filterType === "All Patients") return true;

    const type = patient.type || patient.category || patient.patientClassification || "";

    if (filterType === "Maternal") {
      return ["Maternal", "Pregnant", "Pregnant Patient", "Maternal Care"].includes(
        type,
      );
    }

    if (filterType === "Immunization") {
      return ["Immunization", "Child", "Child Health"].includes(type);
    }

    return type === filterType;
  }

  /* ─────────────────────────────────────────────
   * Fetch Patients
   * ───────────────────────────────────────────── */
  useEffect(() => {
    async function fetchPatients() {
      try {
        setLoading(true);

        const data = await getPatients();

        setPatients(data);
      } catch (error) {
        console.error("Failed to fetch patients:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchPatients();
  }, []);

  /* ─────────────────────────────────────────────
   * Filter Logic
   * ───────────────────────────────────────────── */
  const filteredPatients = useMemo(() => {
    return patients.filter((patient) => {
      const query = filters.search.toLowerCase();
      const searchable = [
        patient.name,
        patient.id,
        patient.contact,
        patient.contactNumber,
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

      const matchesType = matchesPatientType(patient, filters.type);

      return matchesSearch && matchesSex && matchesType;
    });
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
  const stats = useMemo(() => {
    const seniorCitizens = patients.filter(
      (patient) => patient.type === "Senior Citizen",
    ).length;

    const children = patients.filter((patient) =>
      matchesPatientType(patient, "Immunization"),
    ).length;

    const pregnantPatients = patients.filter((patient) =>
      matchesPatientType(patient, "Maternal"),
    ).length;

    return {
      totalPatients: patients.length,
      seniorCitizens,
      children,
      pregnantPatients,
    };
  }, [patients]);

  /* ─────────────────────────────────────────────
   * Return
   * ───────────────────────────────────────────── */
  return {
    patients,
    filteredPatients,
    paginatedPatients,

    loading,

    filters,
    setFilters,

    stats,

    currentPage,
    setCurrentPage,

    totalPages,
    itemsPerPage,
  };
}
