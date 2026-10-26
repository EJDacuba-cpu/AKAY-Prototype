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
  assert.doesNotMatch(html, /Historical parent links/);
});

test('reported names stay primary and historical links are read-only secondary references', () => {
  const html = render({ patient: {
    age: 40, mother_patient_id: 1, mother_name: 'Reported mother',
    mother: { id: 1, first_name: 'Linked', last_name: 'Mother' },
    father_patient_id: 2, father_name: 'Reported father',
    father: { id: 2, first_name: 'Linked', last_name: 'Father' }, guardian_name: 'Separate guardian',
  } });
  for (const text of ['Linked Mother', 'Linked Father', 'Reported mother', 'Reported father', 'Separate guardian']) assert.ok(html.includes(text), text);
  assert.ok(html.indexOf('Reported mother') < html.indexOf('Linked Mother'));
  assert.match(html, /Historical parent links/);
  assert.doesNotMatch(html, /Manage parent connections|Connect registered parents/);
});

test('manual parent names remain editable even when a historical parent link exists', () => {
  const html = render({ editingSection: 'family', patient: {
    mother_patient_id: 1, mother: { id: 1, first_name: 'Linked', last_name: 'Mother' },
  }, form: { motherName: 'Preserved', fatherName: '' } });
  assert.match(html, /name="motherName"/);
  assert.doesNotMatch(html, /<input[^>]*readOnly[^>]*name="motherName"/);
  assert.match(html, /name="fatherName"/);
  assert.match(html, /name="guardianName"/);
  assert.doesNotMatch(html, /name="fatherName"[^>]*required/);
});

test('blank manual names show no inferred value and inaccessible links reveal no identity', () => {
  const html = render({ editingSection: 'family', patient: { mother_patient_id: 8, mother: null, mother_name: '' }, form: { motherName: '' } });
  assert.match(html, /name="motherName" value=""/);
  assert.match(html, /Historical parent links/);
  assert.match(html, /Linked patient details unavailable/);
  assert.doesNotMatch(html, /Unlink|Replace|Search registered/);
});

test('blank reported names remain blank when an authorized historical reference is available', () => {
  for (const age of [4, 40]) {
    const html = render({ editingSection: 'family', patient: { age, mother_patient_id: 8, mother: { id: 8, first_name: 'Historical', last_name: 'Mother' } }, form: { motherName: '' } });
    assert.match(html, /name="motherName" value=""/);
    assert.match(html, /Historical Mother/);
    assert.doesNotMatch(html, /name="motherName"[^>]*value="Historical Mother"/);
    assert.match(html, /Guardian Information/);
  }
});
