import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Plus, Search, Users } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import useAccess from "../../hooks/useAccess";
import useMockFamilyRegistry from "../../hooks/useMockFamilyRegistry";
import { patientName, searchHouseholds } from "../../services/mockFamilyRegistry";
import { familyMembers, familyName } from "../../services/mockFamilyWorkflows";

export default function FamiliesDirectory({ role = "bhc" }) {
  const registry = useMockFamilyRegistry();
  const access = useAccess();
  const [query, setQuery] = useState("");
  const households = searchHouseholds(registry, query);
  const base = `/${role}/families`;
  return <DashboardLayout role={role} title="Families" contentClassName="bg-white px-5 py-7 sm:px-8 lg:px-10">
    <div className="mx-auto max-w-[1440px] space-y-7 text-neutral-900">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-normal tracking-tight">Families</h1>
        {access.can("families.manage") && <Button asChild className="rounded-none"><Link to={`${base}/new`}><Plus size={18} />Add Family</Link></Button>}
      </header>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-full max-w-xl"><Search size={18} aria-hidden="true" className="absolute left-3.5 top-3.5 text-neutral-500" /><Input type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search families" placeholder="Search by FSN, household head, or address" className="h-12 rounded-none pl-11 shadow-none" /></div>
        <p role="status" className="text-sm text-neutral-500">{households.length} {households.length === 1 ? "family" : "families"}</p>
      </div>
      {households.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {households.map(household => {
          const head = registry.patients.find(patient => patient.id === household.headPatientId);
          const count = familyMembers(registry, household.id).length;
          return <article key={household.id} className="flex min-h-56 flex-col gap-4 border border-neutral-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3 text-xs text-neutral-500"><span>{household.serialNumber}</span><span className="flex items-center gap-1.5"><Users size={15} />{count} {count === 1 ? "member" : "members"}</span></div>
            <div><h2 className="text-lg font-semibold">{familyName(registry, household)}</h2><p className="mt-1 text-sm text-neutral-600">Head: {head ? patientName(head) : "Not assigned"}</p></div>
            <div className="text-sm leading-6 text-neutral-600"><p>{household.address.streetAddress}</p><p>{[household.address.purokArea, household.address.barangay, household.address.municipality].filter(Boolean).join(", ")}</p></div>
            <Link to={`${base}/${household.id}`} aria-label={`View ${familyName(registry, household)}, ${household.serialNumber}`} className="mt-auto flex items-center justify-between border-t border-neutral-200 pt-3 text-sm font-medium text-red-700 outline-none focus-visible:ring-2 focus-visible:ring-red-600">View family<ArrowRight size={16} /></Link>
          </article>;
        })}
      </div> : <div className="space-y-4 border-y border-neutral-200 py-14 text-center"><h2 className="text-lg font-medium">No families found</h2><p className="text-sm text-neutral-500">Try another serial number, household head, or address.</p>{access.can("families.manage") && <Button asChild><Link to={`${base}/new`}>Add Family</Link></Button>}</div>}
    </div>
  </DashboardLayout>;
}
