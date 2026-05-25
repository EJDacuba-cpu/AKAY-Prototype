/**
 * DataTable Component - Reusable data table with pagination and actions
 * @component
 *
 * @param {Array<{key: string, label: string, width?: string}>} columns - Column definitions
 * @param {Array<object>} data - Table data
 * @param {boolean} [loading=false] - Loading state
 * @param {Array<{label: string, onClick: Function}>} [actions] - Row actions
 * @param {boolean} [paginated=true] - Show pagination
 * @param {number} [itemsPerPage=10] - Items per page
 * @param {string} [className] - Additional CSS classes
 *
 * @example
 * <DataTable
 *   columns={[
 *     { key: 'name', label: 'Name' },
 *     { key: 'email', label: 'Email' }
 *   ]}
 *   data={patients}
 *   actions={[
 *     { label: 'Edit', onClick: (row) => editPatient(row.id) }
 *   ]}
 * />
 */
import { useState } from "react";
import { LoadingSpinner } from "../atoms";
import { Pagination, ActionMenu } from "../molecules";
import { EmptyState } from "../molecules";
import { Users } from "lucide-react";

export default function DataTable({
  columns,
  data,
  loading = false,
  actions = [],
  paginated = true,
  itemsPerPage = 10,
  className = "",
}) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(data.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = paginated
    ? data.slice(startIndex, startIndex + itemsPerPage)
    : data;

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#E8ECF0] bg-white p-8">
        <LoadingSpinner label="Loading data..." />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon={<Users size={48} />}
        title="No data found"
        description="No records match your criteria"
      />
    );
  }

  return (
    <div
      className={`rounded-2xl border border-[#E8ECF0] bg-white shadow-sm ${className}`}
    >
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-6 py-3 text-left text-sm font-semibold text-slate-700 ${
                    col.width || ""
                  }`}
                >
                  {col.label}
                </th>
              ))}
              {actions.length > 0 && (
                <th className="px-6 py-3 text-right text-sm font-semibold text-slate-700">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((row, idx) => (
              <tr
                key={idx}
                className="border-b border-slate-100 hover:bg-slate-50 transition"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="px-6 py-4 text-sm text-slate-900"
                  >
                    {row[col.key]}
                  </td>
                ))}
                {actions.length > 0 && (
                  <td className="px-6 py-4 text-right">
                    {actions.length === 1 ? (
                      <button
                        onClick={() => actions[0].onClick(row)}
                        className="text-sm font-medium text-blue-600 hover:text-blue-700"
                      >
                        {actions[0].label}
                      </button>
                    ) : (
                      <ActionMenu
                        items={actions.map((action) => ({
                          label: action.label,
                          onClick: () => action.onClick(row),
                        }))}
                      />
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {paginated && totalPages > 1 && (
        <div className="border-t border-slate-200 px-6 py-4">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      )}
    </div>
  );
}
