import { Plus, X } from "lucide-react";

import {
  CheckboxField,
  NumberField,
  SMALL_BUTTON_CLASS,
  SelectField,
  TextField,
  parseInteger,
} from "./HistoryFields";

/**
 * A repeating list of rows (allergies, hospitalizations, family items,
 * pregnancies, patient-reported conditions). Controlled: `items` in,
 * `onChange(nextItems)` out; it keeps no state and has no save logic.
 *
 * columns: [{ key, label, type: 'text'|'number'|'select', options?, required?,
 *   min?, max?, emptyLabel?, valueType?: 'number' }]. A select with
 * valueType 'number' stages an integer (or null).
 *
 * `newItem` is copied for each added row; it should hold only visible inputs.
 * With `noneLabel`, a checkbox ("None known") sits above the rows. The parent
 * owns the exclusivity: checking it should clear the items (in `onNoneChange`)
 * and adding an item should uncheck it (in `onChange`). While `noneChecked`
 * the add button is hidden.
 */
export default function ListEditor({
  label,
  items = [],
  onChange,
  columns,
  newItem,
  addLabel = "Add",
  noneLabel,
  noneChecked = false,
  onNoneChange,
}) {
  function update(index, key, next) {
    onChange(items.map((item, position) => (position === index ? { ...item, [key]: next } : item)));
  }

  function remove(index) {
    onChange(items.filter((_, position) => position !== index));
  }

  function renderCell(column, item, index) {
    const common = {
      label: column.label,
      required: column.required,
      value: item[column.key],
    };
    if (column.type === "number") {
      return (
        <NumberField
          {...common}
          min={column.min}
          max={column.max}
          onChange={(next) => update(index, column.key, next)}
        />
      );
    }
    if (column.type === "select") {
      const numeric = column.valueType === "number";
      return (
        <SelectField
          {...common}
          options={column.options}
          emptyLabel={column.emptyLabel}
          onChange={(next) => update(index, column.key, numeric ? parseInteger(next) : next)}
        />
      );
    }
    return <TextField {...common} onChange={(next) => update(index, column.key, next)} />;
  }

  return (
    <div className="space-y-2">
      {noneLabel && (
        <CheckboxField label={noneLabel} checked={noneChecked} onChange={onNoneChange} />
      )}

      {items.length === 0 && !noneChecked && (
        <p className="text-[12.5px] text-gray-500">Nothing recorded.</p>
      )}

      {items.map((item, index) => (
        <div key={index} className="relative border border-gray-200 bg-white p-3 pr-9">
          <button
            type="button"
            onClick={() => remove(index)}
            aria-label={`Remove ${label} ${index + 1}`}
            className="absolute right-2 top-2 text-gray-400 transition hover:text-red-600"
          >
            <X size={14} />
          </button>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
            {columns.map((column) => (
              <div key={column.key}>{renderCell(column, item, index)}</div>
            ))}
          </div>
        </div>
      ))}

      {!noneChecked && (
        <button
          type="button"
          onClick={() => onChange([...items, { ...newItem }])}
          aria-label={`${addLabel} ${label}`}
          className={SMALL_BUTTON_CLASS}
        >
          <Plus size={13} />
          {addLabel}
        </button>
      )}
    </div>
  );
}
