import "./search-filter-cluster.css";

/**
 * Pill cluster that keeps search and Filter on one horizontal row
 * (AKAY list modules: Referrals, Patients, Follow-ups, Families, etc.).
 */
export default function SearchFilterCluster({
  search,
  filter,
  className = "",
  searchClassName = "",
  filterClassName = "",
}) {
  return (
    <div
      className={`search-filter-cluster inline-flex max-w-full flex-nowrap items-stretch gap-0 overflow-hidden rounded-full border border-neutral-200 bg-white p-0.5 ${className}`}
    >
      <div
        className={`search-filter-cluster__search min-w-[11rem] max-w-[17rem] flex-1 ${searchClassName}`}
      >
        {search}
      </div>
      {filter ? (
        <div
          className={`search-filter-cluster__filter flex shrink-0 items-center self-center ${filterClassName}`}
        >
          {filter}
        </div>
      ) : null}
    </div>
  );
}
