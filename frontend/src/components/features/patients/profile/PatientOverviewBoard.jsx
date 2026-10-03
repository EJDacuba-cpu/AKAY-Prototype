/**
 * Layout for the patient profile's Overview tab: one continuous tinted
 * surface (no cards) holding the tab strip, a responsive three-column grid
 * and the Background sections below it. Layout only - every slot is rendered
 * by the caller.
 *
 * The surface bleeds into DashboardLayout's scroll-area padding (p-3 /
 * sm:p-4 / lg:p-5, mirrored by --bleed) so it fills the whole content area,
 * and is at least as tall as that area.
 *
 * DOM order is identity -> clinical -> anatomy, which is the stacking order
 * on phones and tablets; at xl `order` puts anatomy in the centre at
 * 25 / 40 / 35. Passing `restricted` replaces clinical + anatomy with one cell.
 */
export default function PatientOverviewBoard({ tabStrip, identity, clinical, anatomy, restricted, below }) {
  const cell = "min-w-0 px-4 py-5 sm:px-6";

  return (
    <div className="bhc-patient-profile flex min-h-[calc(100%+2*var(--bleed))] flex-col bg-slate-100 font-sans [--bleed:0.75rem] m-[calc(var(--bleed)*-1)] sm:[--bleed:1rem] lg:[--bleed:1.25rem] [&_h1]:font-sans! [&_h2]:font-sans! [&_h3]:font-sans! [&_h4]:font-sans!">
      <div className="px-4 pt-3 sm:px-6">{tabStrip}</div>

      <div
        role="tabpanel"
        id="profile-panel-overview"
        aria-labelledby="profile-tab-overview"
        className="grid flex-1 grid-cols-1 md:grid-cols-2 xl:grid-cols-[25fr_40fr_35fr]"
      >
        <div className={`${cell} border-b border-slate-200 md:border-r xl:order-1 xl:border-b-0`}>{identity}</div>

        {restricted ? (
          <div className={`${cell} border-b border-slate-200 xl:order-2 xl:col-span-2 xl:border-b-0`}>{restricted}</div>
        ) : (
          <>
            <div className={`${cell} border-b border-slate-200 xl:order-3 xl:border-b-0 xl:border-l`}>{clinical}</div>
            <div
              className={`${cell} border-b border-slate-200 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.95)_0%,rgba(255,255,255,0.35)_45%,transparent_75%)] md:col-span-2 xl:order-2 xl:col-span-1 xl:border-b-0`}
            >
              <div className="xl:sticky xl:top-5">{anatomy}</div>
            </div>
          </>
        )}
      </div>

      {below && <div className="border-t border-slate-200 px-4 py-5 sm:px-6">{below}</div>}
    </div>
  );
}
