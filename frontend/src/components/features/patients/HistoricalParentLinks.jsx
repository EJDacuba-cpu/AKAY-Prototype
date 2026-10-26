import { parentInformation } from '../../../utils/parentLinks';

// Names come only from the facility-scoped patient response, never from a global lookup.
export default function HistoricalParentLinks({ patient }) {
  const parents = ['mother', 'father'].map(role => ({ role, ...parentInformation(patient, role) })).filter(parent => parent.linked);
  if (!parents.length) return null;
  return <aside aria-label="Historical parent links" className="space-y-2 border-t border-neutral-200 pt-3 text-xs text-neutral-600">
    <h3 className="font-semibold text-neutral-700">Historical parent links</h3>
    <dl className="space-y-1">
      {parents.map(parent => <div key={parent.role} className="flex flex-wrap gap-x-2">
        <dt className="font-medium">{parent.role === 'mother' ? 'Mother' : 'Father'}:</dt>
        <dd>{parent.record ? parent.name : 'Linked patient details unavailable'}</dd>
      </div>)}
    </dl>
    <p>Read-only legacy references. Reported names are saved separately; editing them does not change these links.</p>
  </aside>;
}
