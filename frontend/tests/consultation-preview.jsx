// Isolated manual UI fixture. Every API request is handled in memory; this
// fixture never authenticates against or writes to an actual AKAY database.
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationProvider } from '../src/hooks/useNotificationsContext';
import { storeAuthSession } from '../src/services/apiClient';
import ConsultationWorkspace from '../src/pages/bhc/ConsultationWorkspace';
import '../src/index.css';

const scenario = new URLSearchParams(location.search).get('scenario') || 'teen';
const today = new Date();
const year = today.getFullYear();
const birthdate = scenario === 'infant' ? `${year}-06-01` : scenario === 'child' ? `${year - 8}-01-01` : scenario === 'adult' ? `${year - 25}-01-01` : `${year - 16}-01-01`;
const patient = { id: 1, first_name: 'Synthetic', last_name: 'UI Patient', sex: 'Female', birthdate, barangay_health_center_id: 1, status: 'active' };
const drafts = new Map();
const records = [];
window.fetch = async (input, options = {}) => {
  const path = new URL(String(input), location.origin).pathname;
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : {};
  let data = [];
  if (path.endsWith('/patients/1')) data = patient;
  else if (path.includes('/health-record-drafts') && path.endsWith('/transition')) {
    const id = path.split('/').at(-2);
    const draft = drafts.get(id);
    data = { ...draft, version: (draft?.version || 0) + 1, review_state: body.action === 'submit' ? 'review' : body.action === 'return' ? 'encoding' : draft?.review_state || 'encoding' };
    drafts.set(id, data);
  }
  else if (path.includes('/health-record-drafts')) {
    if (method === 'POST' || method === 'PUT') {
      const id = path.split('/').at(-1) === 'health-record-drafts' ? crypto.randomUUID() : path.split('/').at(-1);
      data = { id, patient, classification: body.classification, payload: body.payload, consultation_uuid: body.consultation_uuid, version: (body.version || 0) + 1, last_saved_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString(), status: 'active' };
      drafts.set(id, data);
    } else if (method === 'DELETE') drafts.delete(path.split('/').at(-1));
    else data = drafts.get(path.split('/').at(-1)) || { data: [...drafts.values()] };
  } else if (path.endsWith('/health-records') && method === 'POST') {
    data = { id: records.length + 1, ...body, patient, referrals: [], dispensed_medicines: [] };
    records.push(data);
  } else if (path.endsWith('/health-records')) data = { data: records };
  else if (path.includes('/health-records/')) data = records.at(-1) || {};
  else if (path.endsWith('/notifications/counts')) data = { unread: 0, total: 0 };
  else if (path.endsWith('/health/ready')) data = { status: 'ready' };
  else if (path.endsWith('/availability')) data = { providers: [], has_available_provider: false };
  else if (!path.includes('/api/')) throw Error(`Fixture blocked unexpected request: ${path}`);
  return new Response(JSON.stringify({ data }), { status: method === 'POST' ? 201 : 200, headers: { 'Content-Type': 'application/json' } });
};
storeAuthSession({ token: 'synthetic-fixture-only', user: { id: Date.now(), name: 'Synthetic BHW', role: 'bhw', permissions: ['consultations.encode', 'consultations.finalize', 'records.correct', 'clinical.history', 'patients.register', 'referrals.submit', 'items.dispense', 'inventory.view'], barangay_health_center_id: 1 } });
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const router = createMemoryRouter([
  { path: '/bhc/health-records/add', element: <NotificationProvider><ConsultationWorkspace /></NotificationProvider> },
  { path: '*', element: <p>Synthetic test navigation complete.</p> },
], { initialEntries: ['/bhc/health-records/add?patientId=1&mode=new'] });
createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
