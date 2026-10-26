import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const server = await createServer({ configFile: false, plugins: [react()],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const { default: Sections } = await server.ssrLoadModule('/src/components/features/patients/profile/RegistrationSections.jsx');
const render = (props = {}) => renderToStaticMarkup(createElement(Sections, {
  patient: { age: 40 }, form: {}, editingSection: null, onChange: () => {}, ...props,
}));

test('empty parent and guardian information stays accessible for adults', () => {
  const html = render();
  assert.match(html, /Parent Information/);
  assert.match(html, /Guardian Information/);
  assert.match(html, /Not recorded/);
});

test('both linked parents display registered identity and preserve reported names as separate context', () => {
  const html = render({ patient: {
    age: 40, mother_patient_id: 1, mother_name: 'Reported mother',
    mother: { id: 1, first_name: 'Linked', last_name: 'Mother' },
    father_patient_id: 2, father_name: 'Reported father',
    father: { id: 2, first_name: 'Linked', last_name: 'Father' }, guardian_name: 'Separate guardian',
  } });
  for (const text of ['Linked Mother', 'Linked Father', 'Reported mother', 'Reported father', 'Separate guardian']) assert.ok(html.includes(text), text);
});

test('linked parents have no duplicate editable name field while unlinked parents retain optional fallback', () => {
  const html = render({ editingSection: 'family', patient: {
    mother_patient_id: 1, mother: { id: 1, first_name: 'Linked', last_name: 'Mother' },
  }, form: { motherName: 'Preserved', fatherName: '' } });
  assert.doesNotMatch(html, /name="motherName"/);
  assert.match(html, /name="fatherName"/);
  assert.match(html, /name="guardianName"/);
  assert.doesNotMatch(html, /name="fatherName"[^>]*required/);
});
