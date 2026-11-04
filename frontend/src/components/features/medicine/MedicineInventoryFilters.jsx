import ListFilterPopover from '../../common/filters/ListFilterPopover';
import { BHC_EXPIRY_FILTER_OPTIONS, BHC_STOCK_FILTER_OPTIONS } from '../../../utils/medicineInventoryStatus';
import { MEDICINE_CATEGORIES } from '../../../services/medicineService';

const LIST_FILTER_DEFAULTS = { category: 'All Categories', status: 'All Status', expiry: 'All Expiry' };
const CATEGORY_OPTIONS = ['All Categories', ...MEDICINE_CATEGORIES];

const FIELDS = [
  {
    key: 'status',
    label: 'Stock',
    resetValue: LIST_FILTER_DEFAULTS.status,
    options: BHC_STOCK_FILTER_OPTIONS,
  },
  {
    key: 'expiry',
    label: 'Expiry',
    resetValue: LIST_FILTER_DEFAULTS.expiry,
    options: BHC_EXPIRY_FILTER_OPTIONS,
  },
  {
    key: 'category',
    label: 'Category',
    resetValue: LIST_FILTER_DEFAULTS.category,
    options: CATEGORY_OPTIONS,
    fullWidth: true,
  },
];

export { LIST_FILTER_DEFAULTS as MEDICINE_LIST_FILTER_DEFAULTS, FIELDS as MEDICINE_FILTER_FIELDS };

export default function MedicineInventoryFilters({
  applied,
  activeCount,
  activeFilters = [],
  onApply,
  onRemoveFilter,
  onClearAll,
}) {
  return (
    <ListFilterPopover
      fields={FIELDS}
      applied={applied}
      activeCount={activeCount}
      activeFilters={activeFilters}
      onApply={onApply}
      onRemoveFilter={onRemoveFilter}
      onClearAll={onClearAll}
      buildDefaults={() => ({ ...LIST_FILTER_DEFAULTS })}
    />
  );
}
