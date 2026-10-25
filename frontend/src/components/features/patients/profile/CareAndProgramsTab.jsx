import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import CareTrackingCard from "./CareTrackingCard";
import DispensedMedicinesSection from "./DispensedMedicinesSection";
import MaternalTrackingPanel from "./MaternalTrackingPanel";
import TbTrackingChart from "../../health-records/TbTrackingChart";
import { EmptyNote, FieldList } from "./ProfileSection";
import { Button } from "../../../ui/button";
import { Card } from "../../../ui/card";
import { Input } from "../../../ui/input";
import { getCareTracking } from "../../../../utils/careTracking";
import { buildDispensedMedicineRows, buildMaternalTracking } from "../../../../utils/patientTrackingView";
import { formatShortDate } from "../../../../utils/patientProfile";
import searchIcon from "../../../../assets/figma/search.svg";


/**
 * Patient care tracking derived from finalized consultations and health records.
 * Includes clinical care tracking and dispensed medicines.
 * This view is read-only.
 */

export default function CareAndProgramsTab({
  patient,
  patientId,
  records = [],
  isLoading = false,
  isError = false,
  onRetryRecords,
  basePath = "/bhc",
  onViewProgramRecords,
  onViewRecord,
}) {
  const navigate = useNavigate();
  const [selectedKey, setSelectedKey] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [layout, setLayout] = useState("Grid");
  const [cardSearch, setCardSearch] = useState("");
  const detailRef = useRef(null);

  const careTracking = useMemo(
    () => getCareTracking(patient || {}, records, new Date()).filter((entry) => entry.records.length > 0),
    [patient, records],
  );
  const maternalSummary = useMemo(() =>
    buildMaternalTracking(careTracking.find((entry) => entry.key === "maternal")?.records || []),
    [careTracking],
  );
  const medicineRows = useMemo(() => buildDispensedMedicineRows(records), [records]);
  const visibleTracking = careTracking.filter((entry) => {
    const isDisease = entry.key === "tb";
    return (typeFilter === "All" || (typeFilter === "Disease" ? isDisease : !isDisease)) &&
      entry.label.toLowerCase().includes(cardSearch.trim().toLowerCase());
  });
  const selectedEntry = visibleTracking.find((entry) => entry.key === selectedKey) || null;

  function handleCardAction(action) {
    if (action?.type === "start-postpartum-follow-up") {
      // Without a followUpId, mode=followup opens a new step-flow
      // consultation for this patient (utils/consultationRoute.js), with
      // serviceType preselecting the Maternal classification.
      const params = new URLSearchParams({
        patientId: String(patientId || ""),
        mode: "followup",
        serviceType: "Maternal",
        focus: "deliveryDate",
      });
      navigate(`${basePath}/health-records/add?${params.toString()}`);
    }
  }

  function openTracking(key) {
    setSelectedKey(key);
    detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="px-4 py-5 @lg:px-8">
      <section aria-labelledby="care-tracking-title">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="care-tracking-title" className="text-lg font-semibold text-[#111827]">Care Tracking</h2>
            <p className="mt-0.5 text-xs text-neutral-500">From finalized consultations and existing health records</p>
          </div>
          <div role="group" aria-label="Tracking card layout" className="flex gap-1">
            {["Grid", "List"].map((option) => (
              <Button key={option} type="button" variant="ghost" size="sm" aria-pressed={layout === option} onClick={() => setLayout(option)} className={`h-8 rounded-lg border px-3 text-xs ${layout === option ? "border-neutral-500 bg-neutral-50" : "border-neutral-200 bg-white"}`}>{option}</Button>
            ))}
          </div>
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Filter active tracking" className="flex flex-wrap gap-1.5">
            {["All", "Program", "Disease"].map((option) => (
              <Button key={option} type="button" variant="ghost" size="sm" aria-pressed={typeFilter === option} onClick={() => setTypeFilter(option)} className={`h-8 rounded-lg border px-3 text-xs ${typeFilter === option ? "border-neutral-500 bg-neutral-50" : "border-neutral-200 bg-white"}`}>{option}</Button>
            ))}
          </div>
          <label className="relative block w-full max-w-64">
            <span className="sr-only">Search care tracking</span>
            <img src={searchIcon} alt="" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input value={cardSearch} onChange={(event) => setCardSearch(event.target.value)} placeholder="Search care tracking" className="h-8 rounded-lg border-neutral-200 pl-9 text-xs shadow-none" />
          </label>
        </div>
        {isError ? (
          <p role="alert" className="rounded-lg border border-alert-100 bg-alert-50 p-5 text-sm text-alert-700">Could not load care tracking. <Button type="button" variant="link" size="sm" onClick={() => onRetryRecords?.()} className="h-auto p-0 text-alert-700 underline">Retry</Button></p>
        ) : isLoading ? (
          <p role="status" className="border border-neutral-200 bg-white p-5 text-sm text-neutral-500">Loading care tracking...</p>
        ) : visibleTracking.length === 0 ? (
          <Card className="rounded-lg border-neutral-200 p-5"><EmptyNote>{careTracking.length === 0 ? "No care tracking from finalized consultations yet." : "No care tracking matches this filter."}</EmptyNote></Card>
        ) : (
          <div className={`grid gap-3 ${layout === "Grid" ? "@md:grid-cols-2 @2xl:grid-cols-3" : "grid-cols-1"}`}>
            {visibleTracking.map((entry) => (
              <CareTrackingCard
                key={entry.key}
                entry={entry.key === "maternal" ? { ...entry, facts: [
                  ...(maternalSummary.gp ? [{ label: "G/P", value: maternalSummary.gp, type: "text" }] : []),
                  ...(entry.status === "Prenatal" && maternalSummary.aog ? [{ label: "AOG", value: maternalSummary.aog, type: "text" }] : []),
                ] } : entry}
                selected={selectedEntry?.key === entry.key}
                onOpen={openTracking}
                onViewRecords={onViewProgramRecords}
                onAction={handleCardAction}
              />
            ))}
          </div>
        )}
        <div ref={detailRef} className="mt-5">
          {isError ? null : selectedEntry?.key === "maternal" ? (
            <MaternalTrackingPanel summary={maternalSummary} status={selectedEntry.status} onViewRecords={() => onViewProgramRecords?.("maternal")} />
          ) : selectedEntry?.key === "tb" ? (
            <Card className="rounded-lg border-neutral-200 p-5 shadow-none">
              <h3 className="text-sm font-bold text-[#111827]">TB DOTS Tracking</h3>
              <p className="mt-1 text-xs text-neutral-500">{selectedEntry.status} · read-only adherence from the treatment calendar</p>
              <div className="mt-4">
                <TbTrackingChart
                  tbData={(selectedEntry.records || []).at(-1)?.tbData || (selectedEntry.records || []).at(-1)?.tb_data}
                  caseNumber={selectedEntry.facts?.find((fact) => fact.label === "Case No.")?.value || ""}
                />
              </div>
              <Button type="button" variant="link" size="sm" onClick={() => onViewProgramRecords?.("tb")} className="mt-4 h-auto rounded-lg p-0 text-xs">View health records</Button>
            </Card>
          ) : selectedEntry ? (
            <Card className="rounded-lg border-neutral-200 p-5 shadow-none">
              <h3 className="text-sm font-bold text-[#111827]">{selectedEntry.label} Tracking</h3>
              <p className="mt-1 text-xs text-neutral-500">{selectedEntry.status}</p>
              <div className="mt-4 max-w-xl">
                <FieldList rows={[
                  ...selectedEntry.facts.map((fact) => [fact.label, fact.type === "date" ? formatShortDate(fact.value) : fact.value]),
                  ["Last visit", selectedEntry.lastVisit ? formatShortDate(selectedEntry.lastVisit) : ""],
                  ["Next visit", selectedEntry.nextVisit ? formatShortDate(selectedEntry.nextVisit) : ""],
                ]} />
              </div>
              <Button type="button" variant="link" size="sm" onClick={() => onViewProgramRecords?.(selectedEntry.key)} className="mt-4 h-auto rounded-lg p-0 text-xs">View health records</Button>
            </Card>
          ) : null}
        </div>
      </section>

      <DispensedMedicinesSection rows={medicineRows} isLoading={isLoading} isError={isError} onRetry={onRetryRecords} onViewRecord={onViewRecord} />
    </div>
  );
}
