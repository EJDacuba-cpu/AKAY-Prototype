/**
 * useDataTable Hook - Handle pagination, filtering, and sorting for tables
 * @hook
 *
 * @param {Array} data - Array of items
 * @param {object} [options={}] - Options: { itemsPerPage: 10, initialFilters: {} }
 *
 * @returns {Object} { paginatedData, currentPage, setCurrentPage, filters, setFilters, totalPages, stats }
 *
 * @example
 * const table = useDataTable(patients, { itemsPerPage: 15 });
 * return <DataTable data={table.paginatedData} />;
 */
import { useState, useMemo } from "react";

export default function useDataTable(data = [], options = {}) {
  const { itemsPerPage = 10, initialFilters = {} } = options;

  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState(initialFilters);

  // Apply filters
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const searchableFields = ["name", "email", "contact", "phone"];
        const matches = searchableFields.some((field) =>
          item[field]?.toString().toLowerCase().includes(searchLower),
        );
        if (!matches) return false;
      }

      // Custom filters
      for (const [key, value] of Object.entries(filters)) {
        if (key === "search") continue;
        if (value && value !== "All" && item[key] !== value) {
          return false;
        }
      }

      return true;
    });
  }, [data, filters]);

  // Paginate
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = filteredData.slice(
    startIndex,
    startIndex + itemsPerPage,
  );

  // Reset to page 1 when filters change
  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  return {
    paginatedData,
    currentPage,
    setCurrentPage,
    totalPages,
    filters,
    setFilters: handleFilterChange,
    filteredCount: filteredData.length,
    totalCount: data.length,
  };
}
