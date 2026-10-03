/**
 * Layout for the patient profile's Overview tab: a three-column grid of white
 * cards on the page background that fills the height its parent gives it.
 * Layout only - every column is rendered by the caller.
 *
 * At xl the grid is a single row the height of the board, so each column
 * divides that height among its cards by share (see OverviewCard) and the
 * geometry is the same for every patient. Below xl the columns stack at the
 * cards' minimum heights and the board scrolls. If a short window cannot fit
 * the minimums the board scrolls too.
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
      className="akay-content-scroll grid min-h-0 flex-1 grid-cols-1 gap-x-1.5 gap-y-1.5 overflow-y-auto md:grid-cols-2 xl:grid-cols-[minmax(0,24fr)_minmax(0,46fr)_minmax(0,30fr)] xl:grid-rows-1"
    >
      <div className="flex min-w-0 flex-col xl:order-1 xl:min-h-0">{left}</div>
      <div className="flex min-w-0 flex-col xl:order-3 xl:min-h-0">{right}</div>
      <div className="flex min-w-0 flex-col md:col-span-2 xl:order-2 xl:col-span-1 xl:min-h-0">{center}</div>
    </div>
  );
}
