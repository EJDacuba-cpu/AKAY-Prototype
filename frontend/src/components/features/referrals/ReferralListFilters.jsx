import ListFilterPopover from "../../common/filters/ListFilterPopover";

export default function ReferralListFilters({
  fields,
  applied,
  activeCount,
  activeFilters = [],
  onApply,
  onRemoveFilter,
  onClearAll,
}) {
  return (
    <ListFilterPopover
      fields={fields}
      applied={applied}
      activeCount={activeCount}
      activeFilters={activeFilters}
      onApply={onApply}
      onRemoveFilter={onRemoveFilter}
      onClearAll={onClearAll}
    />
  );
}
