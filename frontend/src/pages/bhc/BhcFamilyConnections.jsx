import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/layout/DashboardLayout';
import ModalShell from '../../components/common/modals/ModalShell';
import { Button } from '../../components/ui/button';
import useBhcHouseholdScope from '../../hooks/useBhcHouseholdScope';
import { addRelationship, changeRelationship, getHouseholdById, removeRelationship } from '../../services/householdService';
import { patientName } from '../../services/familyRegistry';
import { candidateRelatives, connectionRowsFor, describeConnection } from '../../utils/familyConnections';

const base = '/bhc/families';
const selectClass = 'h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm';
const TYPES = [['spouse', 'Spouse'], ['sibling', 'Sibling']];

// Explicit spouse/sibling links only. Nothing here is inferred from labels, and parent links stay on each patient's record.
export default function BhcFamilyConnections() {
  const { householdId, memberId } = useParams();
  const scope = useBhcHouseholdScope();
  const client = useQueryClient();
  const key = [...scope.key, 'detail', householdId];
  const query = useQuery({ queryKey: key, queryFn: () => getHouseholdById(householdId), retry: false });
  const household = query.data;
  const member = household?.members.find((item) => item.id === memberId);
  const [add, setAdd] = useState({ relativeId: '', type: 'spouse' });
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const nameOf = (id) => patientName(household?.members.find((item) => item.id === id));

  const mutation = useMutation({
    mutationFn: (action) => {
      const { version } = household;
      if (action.kind === 'add') return addRelationship(householdId, { version, patientId: memberId, relativeId: action.relativeId, type: action.type });
      if (action.kind === 'change') return changeRelationship(householdId, action.id, { version, type: action.type });
      return removeRelationship(householdId, action.id, { version });
    },
    onSuccess: async (saved, action) => {
      client.setQueryData(key, saved);
      await Promise.all([client.invalidateQueries({ queryKey: scope.key }), client.invalidateQueries({ queryKey: ['patient-details', 'bhc'] })]);
      toast.success(action.kind === 'add' ? 'Connection added.' : action.kind === 'change' ? 'Connection updated.' : 'Connection removed.');
      setPending(null);
      setError('');
      if (action.kind === 'add') setAdd({ relativeId: '', type: 'spouse' });
    },
    onError: (failure) => {
      setConflict(failure.status === 409);
      setError(failure.errors?.relationship?.[0] || failure.errors?.type?.[0] || failure.message || 'Unable to save the connection.');
      setPending(null);
    },
  });

  const frame = (children) => <DashboardLayout role="bhc" title="Family Connections" contentClassName="bg-white px-5 py-7 sm:px-8 lg:px-10"><div className="mx-auto max-w-3xl space-y-6 text-neutral-900"><Link to={`${base}/${householdId}`} className="inline-flex items-center gap-2 text-sm text-neutral-600"><ArrowLeft size={16} />Back to Family</Link>{children}</div></DashboardLayout>;
  if (query.isPending || query.error) return frame(<div className="space-y-3 py-8"><p role={query.error ? 'alert' : 'status'}>{query.error ? 'Unable to load household data. Please retry.' : 'Loading household…'}</p>{query.error && <Button variant="outline" onClick={() => query.refetch()}>Retry</Button>}</div>);
  if (!member || household.archivedAt) return frame(<p role="status">This family member is not available.</p>);

  const rows = connectionRowsFor(household, memberId);
  const candidates = candidateRelatives(household, memberId);
  const parents = [['Mother', member.motherPatientId], ['Father', member.fatherPatientId]].filter(([, id]) => id && household.members.some((item) => item.id === id));
  const busy = mutation.isPending;
  const confirmText = !pending ? '' : pending.kind === 'add'
    ? `Record ${patientName(member)} as ${pending.type} of ${nameOf(pending.relativeId)}?`
    : pending.kind === 'change'
      ? `Change the connection between ${patientName(member)} and ${nameOf(pending.relativeId)} to ${pending.type}?`
      : `Remove the ${pending.type} connection between ${patientName(member)} and ${nameOf(pending.relativeId)}? Both patients stay in the household.`;

  return frame(<>
    <header><h1 className="text-3xl font-normal tracking-tight">Connections for {patientName(member)}</h1><p className="mt-2 text-sm text-neutral-500">Only connections you confirm here are saved. Household labels do not create connections.</p></header>
    {error && <div role="alert" className="space-y-2 text-sm text-red-700"><p>{error}</p>{conflict && <Button type="button" variant="outline" onClick={() => { setConflict(false); setError(''); query.refetch(); }}>Reload saved family</Button>}</div>}
    <section aria-labelledby="saved-connections" className="space-y-3">
      <h2 id="saved-connections" className="text-lg font-semibold">Saved connections</h2>
      {rows.length ? <ul className="divide-y divide-neutral-200 border-y border-neutral-200">{rows.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
        <span>{describeConnection(row.type, nameOf(row.relativeId))}</span>
        <span className="flex items-center gap-2">
          <select aria-label={`Connection type with ${nameOf(row.relativeId)}`} className={`${selectClass} w-36`} value={row.type} disabled={busy} onChange={(event) => event.target.value !== row.type && setPending({ kind: 'change', id: row.id, relativeId: row.relativeId, type: event.target.value })}>{TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setPending({ kind: 'remove', id: row.id, relativeId: row.relativeId, type: row.type })}>Remove<span className="sr-only"> connection with {nameOf(row.relativeId)}</span></Button>
        </span>
      </li>)}</ul> : <p className="text-sm text-neutral-500" role="status">No spouse or sibling connections saved.</p>}
      {parents.length > 0 && <p className="text-xs text-neutral-500">Parent links from the patient record: {parents.map(([label, id]) => `${label}: ${nameOf(id)}`).join(', ')}. Change them in Patient Information.</p>}
    </section>
    <section aria-labelledby="add-connection" className="space-y-3 border-t border-neutral-200 pt-6">
      <h2 id="add-connection" className="text-lg font-semibold">Add a connection</h2>
      {candidates.length ? <form className="grid gap-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end" noValidate onSubmit={(event) => { event.preventDefault(); if (add.relativeId && !busy) setPending({ kind: 'add', ...add }); }}>
        <div className="space-y-1.5"><label htmlFor="relative" className="block text-sm font-medium">Household member</label><select id="relative" className={selectClass} value={add.relativeId} onChange={(event) => setAdd({ ...add, relativeId: event.target.value })}><option value="">Select a member</option>{candidates.map((item) => <option key={item.id} value={item.id}>{patientName(item)}</option>)}</select></div>
        <div className="space-y-1.5"><label htmlFor="connection-type" className="block text-sm font-medium">Connection</label><select id="connection-type" className={selectClass} value={add.type} onChange={(event) => setAdd({ ...add, type: event.target.value })}>{TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <Button type="submit" disabled={!add.relativeId || busy}>Add connection</Button>
      </form> : <p className="text-sm text-neutral-500" role="status">No other household member can be connected.</p>}
    </section>
    {pending && <ModalShell title="Confirm connection" appearance="plain" onClose={() => !busy && setPending(null)} footer={<><Button type="button" variant="ghost" disabled={busy} onClick={() => setPending(null)}>Cancel</Button><Button type="button" disabled={busy} onClick={() => mutation.mutate(pending)}>{busy ? 'Saving…' : 'Confirm'}</Button></>}><p>{confirmText}</p></ModalShell>}
  </>);
}
