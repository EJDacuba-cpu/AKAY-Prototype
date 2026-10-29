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

function monthsAgoIso(months) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

test('infant demographics hide civil status, occupation, education, NHTS and spouse', () => {
  const birthDate = monthsAgoIso(4);
  const infant = { birthDate, civilStatus: 'Single', occupation: 'None', education_level: 'None', nhts_status: 'NHTS', spouse_name: 'Hidden' };
  const view = render({ patient: infant, form: { birthDate } });
  assert.doesNotMatch(view, /Civil status/);
  assert.doesNotMatch(view, /Occupation/);
  assert.doesNotMatch(view, />Education</);
  assert.doesNotMatch(view, /NHTS status/);
  assert.doesNotMatch(view, /Spouse/);
  assert.match(view, /Birthday/);
  assert.match(view, /Parent Information/);

  const edit = render({ patient: infant, form: { birthDate, civilStatus: 'Single', occupation: 'None' }, editingSection: 'demographics' });
  assert.doesNotMatch(edit, /name="civilStatus"/);
  assert.doesNotMatch(edit, /name="occupation"/);
  assert.doesNotMatch(edit, /name="educationLevel"/);
  assert.doesNotMatch(edit, /name="nhtsStatus"/);
  assert.doesNotMatch(edit, /name="spouseName"/);
});

test('a 5-year-old still shows civil status', () => {
  const birthDate = monthsAgoIso(60);
  const html = render({ patient: { birthDate, civilStatus: 'Single' }, form: { birthDate, civilStatus: 'Single' } });
  assert.match(html, /Civil status/);
});

test('infant family edit requires a mother name and leaves father optional', () => {
  const birthDate = monthsAgoIso(2);
  const html = render({
    patient: { birthDate },
    form: { birthDate, motherName: '', fatherName: '' },
    editingSection: 'family',
  });
  assert.match(html, /required(?:="")?[^>]*name="motherName"/);
  assert.doesNotMatch(html, /required(?:="")?[^>]*name="fatherName"/);
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
