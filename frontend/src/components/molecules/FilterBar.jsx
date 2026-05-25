/**
 * FilterBar Component - Combine multiple filter inputs
 * @component
 *
 * @param {Array<{key: string, label: string, type: 'text'|'select', options?: Array}>} filters - Filter definitions
 * @param {object} values - Current filter values
 * @param {Function} onChange - Filter change handler
 * @param {Function} [onReset] - Reset handler
 * @param {string} [className] - Additional CSS classes
 *
 * @example
 * <FilterBar
 *   filters={[
 *     { key: 'search', label: 'Search', type: 'text' },
 *     { key: 'status', label: 'Status', type: 'select', options: [...] }
 *   ]}
 *   values={filters}
 *   onChange={setFilters}
 * />
 */
import { Input, Select } from "../atoms";

export default function FilterBar({
  filters,
  values,
  onChange,
  onReset,
  className = "",
}) {
  return (
    <div
      className={`
        rounded-lg
        border border-slate-200
        bg-slate-50
        p-4
        ${className}
      `}
    >
      <div className="flex flex-wrap items-end gap-4">
        {filters.map((filter) => (
          <div key={filter.key} className="flex-1 min-w-[150px]">
            {filter.type === "text" ? (
              <Input
                type="text"
                label={filter.label}
                placeholder={filter.placeholder}
                value={values[filter.key] || ""}
                onChange={(e) =>
                  onChange({
                    ...values,
                    [filter.key]: e.target.value,
                  })
                }
              />
            ) : filter.type === "select" ? (
              <Select
                label={filter.label}
                value={values[filter.key] || ""}
                onChange={(e) =>
                  onChange({
                    ...values,
                    [filter.key]: e.target.value,
                  })
                }
                options={filter.options || []}
              />
            ) : null}
          </div>
        ))}
        {onReset && (
          <button
            onClick={onReset}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-white"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
