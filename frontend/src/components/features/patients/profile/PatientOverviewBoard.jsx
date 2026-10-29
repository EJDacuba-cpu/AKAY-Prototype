/** The BHC anatomy workspace shares its canvas with vitals; other profiles retain their existing board. */
export default function PatientOverviewBoard({ left, right, center, anatomyWorkspace = false }) {
  if (anatomyWorkspace) {
    return (
      <section role="tabpanel" id="profile-panel-overview" aria-labelledby="profile-tab-overview" className="anatomy-board min-w-0">
        <div className="patient-overview-anatomy min-w-0">{center}</div>
        <div className="patient-overview-clinical flex min-w-0 flex-col">{right}</div>
      </section>
    );
  }
  return (
    <div
      role="tabpanel"
      id="profile-panel-overview"
      aria-labelledby="profile-tab-overview"
      className="akay-content-scroll grid min-h-0 flex-1 grid-cols-1 content-start gap-5 overflow-y-auto flow:flex-none flow:overflow-visible md:grid-cols-2 @5xl:grid-cols-[12rem_minmax(0,1fr)_16rem]"
    >
      <div className="patient-overview-vitals order-2 flex min-w-0 flex-col self-start @5xl:order-1">{left}</div>
      <div className="patient-overview-anatomy order-1 col-span-full min-w-0 @5xl:order-2 @5xl:col-span-1">{center}</div>
      <div className="patient-overview-clinical order-3 flex min-w-0 flex-col self-start">{right}</div>
    </div>
  );
}
