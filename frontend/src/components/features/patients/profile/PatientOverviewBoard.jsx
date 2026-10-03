/**
 * Layout for the patient profile's Overview tab: a compact three-column grid
 * of white cards on the page background, sized to its content. Layout only -
 * every column is rendered by the caller.
 *
 * DOM order is left -> right -> centre, which is the stacking order on phones
 * and tablets (left and right side by side, the anatomy card below); at xl
 * `order` puts the anatomy card in the middle at 24 / 46 / 30.
 */
export default function PatientOverviewBoard({ left, right, center }) {
  return (
    <div
      role="tabpanel"
      id="profile-panel-overview"
      aria-labelledby="profile-tab-overview"
      className="grid grid-cols-1 items-start gap-x-2 gap-y-1.5 md:grid-cols-2 xl:grid-cols-[minmax(0,24fr)_minmax(0,46fr)_minmax(0,30fr)]"
    >
      <div className="min-w-0 xl:order-1">{left}</div>
      <div className="min-w-0 xl:order-3">{right}</div>
      <div className="min-w-0 md:col-span-2 xl:order-2 xl:col-span-1">{center}</div>
    </div>
  );
}
