import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ModalShell, ModalButton } from '../../common';
import MedicineInventoryActionModal, { STOCK_ACTION_LABELS } from './MedicineInventoryActionModal';
import { getMedicineDetails, restockMedicine, deductMedicine, medicineGroupAction } from '../../../services/medicineService';
import { medicineDetailsKey, retainCalendarData } from '../../../utils/medicineLedger';
import { queryKeys } from '../../../utils/queryKeys';

export default function MedicineActionDialog({ intent, user, role, onClose }) {
  const client = useQueryClient();
  const canManage = (user?.permissions || []).includes('inventory.manage');
  const detailsKey = medicineDetailsKey(user, intent.medicineId);
  const query = useQuery({ queryKey: detailsKey, queryFn: () => getMedicineDetails(intent.medicineId), placeholderData: (data, previous) => retainCalendarData(data, previous, detailsKey), enabled: canManage, retry: false });
  if (!canManage) return null;
  if (!query.data) return <ModalShell open title={STOCK_ACTION_LABELS[intent.mode]} onClose={onClose} size="lg"><div role={query.isError ? 'alert' : 'status'} className="space-y-3 text-sm text-neutral-600">{query.isError ? 'Unable to load current medicine stock.' : 'Loading current medicine stock…'}{query.isError && <ModalButton onClick={() => query.refetch()}>Try Again</ModalButton>}</div></ModalShell>;
  async function submit(payload, options) {
    if (intent.mode === 'restock') await restockMedicine(intent.medicineId, payload, options);
    else if (intent.mode === 'deduct') await deductMedicine(intent.medicineId, payload, options);
    else await medicineGroupAction(intent.medicineId, { action: intent.mode, expiry_group_id: payload.expiry_group_id, quantity: payload.quantity, reason: payload.reason }, options);
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.medicineAvailability(role, user) }),
      client.invalidateQueries({ queryKey: queryKeys.medicineTransactions(user, intent.medicineId) }),
      client.invalidateQueries({ queryKey: queryKeys.dashboardSummary('bhc') }),
    ]);
    toast.success(`${STOCK_ACTION_LABELS[intent.mode]} recorded.`);
    onClose();
  }
  return <MedicineInventoryActionModal open mode={intent.mode} item={query.data} initialGroupId={intent.groupId || ''} onClose={onClose} onSubmit={submit} />;
}
