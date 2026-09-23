import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getReferralDestination } from "../../../services/referrals";
import { apiRequest, getStoredAuthUser } from "../../../services/apiClient";

export default function ReferralDestinationPicker({ value, onChange, patientId, recordId }) {
  const user = getStoredAuthUser();
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);
  const {data,error,refetch} = useQuery({queryKey:["approved-referral-destinations",user?.id,user?.working_facility_key],queryFn:getReferralDestination,refetchInterval:30000});
  const destinations=data?.destinations || [];
  const selected=destinations.find(d=>String(d.id)===String(value));
  useEffect(()=>{
    if (!value && data?.receivingRuralHealthUnit?.id) onChange(String(data.receivingRuralHealthUnit.id));
  },[value,data,onChange]);
  async function hold(){setBusy(true);setMessage("");try{await apiRequest("/referral-holds",{method:"POST",body:{patient_id:patientId,health_record_id:recordId||null,rural_health_unit_id:Number(value)}});setMessage("Referral held at the selected RHU. Review and submit after availability changes; no referral was submitted.");}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  return <section className="my-4 space-y-3 rounded-xl border border-red-100 bg-white p-4"><label className="block text-sm font-semibold">Receiving RHU<select aria-label="Receiving RHU" value={value||""} onChange={e=>{onChange(e.target.value);setMessage("");}} className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-3"><option value="">Select approved destination</option>{destinations.map(d=><option key={d.id} value={d.id}>{d.name}{d.is_default?" · Default":""} · {d.availability.available_count} doctor(s) available</option>)}</select></label>
    {error&&<p role="alert" className="text-sm text-red-700">Unable to load approved destinations. <button type="button" onClick={()=>refetch()}>Retry</button></p>}
    {value&&data&&!selected&&<p role="alert" className="text-sm text-red-700">This destination is no longer authorized or active. Choose an approved RHU.</p>}
    {selected&&!selected.availability.can_submit_referral&&<div className="space-y-2 text-sm text-amber-900"><p>No doctor is currently available at {selected.name}. Select an authorized alternative or retain this destination and hold the referral.</p><div className="flex flex-wrap gap-2">{destinations.filter(d=>d.id!==selected.id&&d.availability.can_submit_referral).map(d=><button type="button" key={d.id} onClick={()=>{onChange(String(d.id));setMessage("");}} className="rounded-lg border border-red-200 px-3 py-2 text-red-700">Choose {d.name}</button>)}</div><button type="button" disabled={busy||!patientId} onClick={hold} className="rounded-lg border border-amber-300 px-3 py-2 disabled:opacity-40">{busy?"Saving hold…":"Keep destination & Hold referral"}</button><p className="text-xs">A hold is an administrative state, not an appointment or assurance that waiting is safe.</p></div>}
    {message&&<p role="status" className="text-sm text-slate-600">{message}</p>}
  </section>;
}
