import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import ModalShell from '../../common/modals/ModalShell';
import { getPatientById, getPatientDetailsListByRole, updatePatientParent } from '../../../services/patientService';
import { parentInformation } from '../../../utils/parentLinks';
import { formatLongDate, formatPatientName } from '../../../utils/formatters';

/** Uses patient links, never household labels or spouse/sibling relationship rows. */
export default function FamilyParentLinks({ memberId, scope, role }) {
  const client = useQueryClient();
  const key = [...scope.key, 'parent-links', memberId];
  const query = useQuery({ queryKey: key, queryFn: () => getPatientById(memberId), retry: false });
  const [pending, setPending] = useState(null);
  const [failure, setFailure] = useState(null);
  const mutation = useMutation({
    mutationFn: (action) => updatePatientParent(memberId, action.role, action.parentId, action.previousId),
    onSuccess: async (saved) => {
      client.setQueryData(key, saved);
      setPending(null);
      setFailure(null);
      toast.success('Parent connection saved.');
      await Promise.all([
        client.invalidateQueries({ queryKey: scope.key }),
        client.invalidateQueries({ queryKey: ['patient-details'] }),
        client.invalidateQueries({ queryKey: ['patients'] }),
      ]);
    },
    onError: (error, action) => {
      setFailure({ role: action.role, conflict: error.status === 409,
        message: error.errors?.[`${action.role}_patient_id`]?.[0] || error.errors?.relationship?.[0] || error.message || 'Unable to save the parent connection.' });
      setPending(null);
    },
  });

  return <section aria-labelledby="parent-connections" className="space-y-4 rounded-card border border-neutral-200 bg-white p-5 shadow-[var(--shadow-card)]">
    <div><h2 id="parent-connections" className="text-sm font-bold text-ink-800">Parent connections</h2>
      <p className="mt-1 text-sm text-neutral-600">Confirm a registered Mother or Father, including someone with a different FSN. Each patient keeps their household.</p></div>
    {query.isPending ? <p role="status" className="text-sm text-neutral-600">Loading parent connections…</p>
      : query.error ? <div role="alert" className="space-y-2 text-sm text-red-700"><p>Unable to load parent connections.</p><Button variant="secondary" onClick={() => query.refetch()}>Retry</Button></div>
        : <>
          {['mother', 'father'].map((parentRole) => <ParentConnection key={`${memberId}:${parentRole}`} parentRole={parentRole} patient={query.data} scope={scope} role={role}
            busy={mutation.isPending} failure={failure?.role === parentRole ? failure : null}
            onReload={async () => { await query.refetch(); setFailure(null); }}
            onConfirm={(action) => { setFailure(null); setPending(action); }} />)}
          <p className="border-t border-neutral-200 pt-3 text-xs text-neutral-600">Unregistered, absent or unknown parents do not block registration. Keep optional reported names in Patient Information. If a parent wants to register, use <Link className="font-medium text-ink-700 underline" to={`/${role}/patients/add`}>Add Patient</Link> separately, then return here to connect them. Guardian details are recorded separately.</p>
        </>}
    {pending && <ModalShell title="Confirm parent connection" appearance="plain" onClose={() => !mutation.isPending && setPending(null)} footer={<>
      <Button variant="ghost" disabled={mutation.isPending} onClick={() => setPending(null)}>Cancel</Button>
      <Button disabled={mutation.isPending} onClick={() => mutation.mutate(pending)}>{mutation.isPending ? 'Saving…' : 'Confirm connection'}</Button>
    </>}>
      <p className="text-sm">{pending.parentId
        ? `Confirm ${pending.name} as the ${pending.role === 'mother' ? 'Mother' : 'Father'} of ${formatPatientName(query.data)}?${pending.previousId ? ' This replaces the saved parent connection.' : ''}`
        : `Remove the saved ${pending.role} connection for ${formatPatientName(query.data)}?`}</p>
      <p className="mt-3 text-sm text-neutral-600">Reported parent names and household membership will be preserved. Confirm only an explicitly verified parent-child relationship.</p>
    </ModalShell>}
  </section>;
}

function ParentConnection({ parentRole, patient, scope, role, busy, failure, onConfirm, onReload }) {
  const label = parentRole === 'mother' ? 'Mother' : 'Father';
  const parent = parentInformation(patient, parentRole);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const results = useQuery({
    queryKey: [...scope.key, 'parent-search', parentRole, term, page],
    queryFn: () => getPatientDetailsListByRole(role, { search: term, status: 'active', page, per_page: 25 }),
    enabled: term.length >= 2 && patient.status !== 'inactive', retry: false,
  });
  const candidates = (results.data || []).filter((item) => String(item.id) !== String(patient.id)
    && String(item.id) !== parent.id && item.sex === (parentRole === 'mother' ? 'Female' : 'Male')
    && item.status !== 'inactive');
  const inactive = patient.status === 'inactive';
  const action = (parentId, name) => ({ role: parentRole, parentId, name, previousId: parent.id });

  return <div className="space-y-3 border-t border-neutral-200 pt-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-sm font-semibold text-neutral-900">{label}</h3>
        <p className="mt-1 text-sm text-neutral-700">{parent.linked ? `${parent.name} · Linked patient` : 'No registered parent linked'}</p>
        {parent.reportedName && <p className="mt-1 text-xs text-neutral-600">Reported name: {parent.reportedName}. Preserved separately.</p>}
      </div>
      {parent.linked && <Button variant="ghost" disabled={busy} onClick={() => onConfirm(action('', ''))}>Remove {label.toLowerCase()} link</Button>}
    </div>
    {failure && <div id={`${parentRole}-link-error`} role="alert" className="space-y-2 text-sm text-red-700"><p>{failure.message}</p>{failure.conflict && <Button variant="secondary" onClick={onReload}>Reload saved parent links</Button>}</div>}
    {inactive ? <p className="text-sm text-neutral-600">An inactive patient cannot receive a new parent connection.</p> : <>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); setTerm(search.trim()); }}>
        <div className="min-w-0 flex-1 space-y-1.5"><label htmlFor={`${parentRole}-search`} className="block text-sm font-medium">Find registered {label.toLowerCase()}</label>
          <Input id={`${parentRole}-search`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Patient name or ID" disabled={busy} aria-describedby={`${parentRole}-search-help`} />
          <p id={`${parentRole}-search-help`} className="text-xs text-neutral-600">Search records available to your current facility. Enter at least 2 characters.</p>
        </div>
        <Button type="submit" variant="secondary" disabled={busy || search.trim().length < 2}>Search</Button>
      </form>
      {term && <div aria-live="polite" aria-busy={results.isFetching}>
        {results.isFetching ? <p className="text-sm text-neutral-600">Searching patients…</p> : results.error
          ? <div className="space-y-2 text-sm text-red-700" role="alert"><p>Unable to search patients.</p><Button variant="secondary" onClick={() => results.refetch()}>Retry search</Button></div>
          : <>
            {candidates.length ? <ul className="divide-y divide-neutral-200">{candidates.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 text-sm"><p className="break-words font-medium">{formatPatientName(item)}</p><p className="mt-1 text-xs text-neutral-600">Patient {item.id} · {formatLongDate(item.birthDate, 'Birthday not recorded')} · FSN: {item.familySerialNumber || 'Not assigned'}</p></div>
              <Button variant="secondary" disabled={busy} onClick={() => onConfirm(action(item.id, formatPatientName(item)))}>{parent.linked ? `Replace ${label.toLowerCase()}` : `Link as ${label.toLowerCase()}`}</Button>
            </li>)}</ul> : <p className="text-sm text-neutral-600">No eligible {label.toLowerCase()} found on this page.</p>}
            <div className="mt-3 flex items-center gap-3"><Button variant="ghost" disabled={page === 1 || busy} onClick={() => setPage((value) => value - 1)}>Previous</Button><span className="text-xs text-neutral-600">Page {page}</span><Button variant="ghost" disabled={(results.data?.length || 0) < 25 || busy} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
          </>}
      </div>}
    </>}
  </div>;
}
