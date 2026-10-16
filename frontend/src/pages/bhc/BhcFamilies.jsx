import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import useAccess from '../../hooks/useAccess';
import useBhcHouseholdScope from '../../hooks/useBhcHouseholdScope';
import { getHouseholds, getHouseholdById, saveHousehold, getHouseholdCandidates } from '../../services/householdService';
import FamilyTreeCanvas from '../../components/features/families/FamilyTreeCanvas';
import FamilyMembersList from '../../components/features/families/FamilyMembersList';
import TransferHouseholdModal from '../../components/features/families/TransferHouseholdModal';
import { buildFamilyGraph } from '../../utils/familyGraph';
import { RELATIONSHIP_LABELS } from '../../utils/relationshipLabels';
import { addressText, addressValues, canHeadHousehold, patientName } from '../../services/familyRegistry';

const base='/bhc/families';
function FamilyFrame({title,children}) {
  return <DashboardLayout role="bhc" title={title} contentClassName="bg-white px-5 py-7 sm:px-8 lg:px-10"><div className="mx-auto max-w-[1440px] space-y-6 text-neutral-900">{children}</div></DashboardLayout>;
}
function QueryState({query}) {
  return <div className="space-y-3 py-8"><p role={query.error ? 'alert':'status'}>{query.error ? 'Unable to load household data. Please retry.' : 'Loading households…'}</p>{query.error && <Button variant="outline" onClick={()=>query.refetch()}>Retry</Button>}</div>;
}
function BackLink({to=base,children='Back to Families'}) {
  return <Link to={to} className="inline-flex items-center gap-2 text-sm text-neutral-600"><ArrowLeft size={16}/>{children}</Link>;
}
export function BhcFamiliesDirectory() {
  const scope=useBhcHouseholdScope();
  return <Directory key={scope.identity} scope={scope}/>;
}
function Directory({scope}) {
  const access=useAccess();
  const [draft,setDraft]=useState('');
  const [search,setSearch]=useState('');
  const [page,setPage]=useState(1);
  const query=useQuery({queryKey:[...scope.key,'list',search,page],queryFn:()=>getHouseholds({search,page}),retry:false});
  return <FamilyFrame title="Families">
    <header className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-normal tracking-tight">Families</h1>{access.can('families.manage') && <Button asChild><Link to={`${base}/new`}><Plus size={17}/>Add Family</Link></Button>}</header>
    <form className="flex max-w-xl gap-2" onSubmit={event=>{event.preventDefault();setPage(1);setSearch(draft.trim());}}><div className="relative min-w-0 flex-1"><Search size={17} aria-hidden="true" className="absolute left-3 top-3 text-neutral-500"/><Input type="search" value={draft} onChange={event=>setDraft(event.target.value)} aria-label="Search families" placeholder="Search FSN, household head or address" className="pl-10"/></div><Button variant="outline">Search</Button></form>
    {query.isPending || query.error ? <QueryState query={query}/> : <>
      <p role="status" className="text-sm text-neutral-500">{query.data.meta.total} households in your BHC</p>
      {query.data.items.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{query.data.items.map(item=>{
        const head=item.members.find(member=>member.id === item.headPatientId);
        return <article key={item.id} className="flex min-h-52 flex-col gap-4 border border-neutral-200 bg-white p-5"><p className="font-mono text-xs text-neutral-500">{item.serialNumber}</p><div><h2 className="text-lg font-semibold">{head ? `${head.lastName} Household` : 'Household'}</h2><p className="mt-1 text-sm text-neutral-600">Head: {head ? patientName(head) : 'Not assigned'}</p></div><p className="text-sm leading-6 text-neutral-600">{addressText(item.address)}</p><Link to={`${base}/${item.id}`} className="mt-auto flex items-center justify-between border-t border-neutral-200 pt-3 text-sm font-medium text-red-700">View {item.serialNumber}<ArrowRight size={16}/></Link></article>;
      })}</div> : <div className="space-y-2 border-y border-neutral-200 py-12 text-center"><h2 className="font-medium">No households found</h2><p className="text-sm text-neutral-500">Try another search or create a household through patient registration.</p></div>}
      <nav aria-label="Household pages" className="flex items-center justify-end gap-3"><Button variant="outline" disabled={page <= 1 || query.isFetching} onClick={()=>setPage(value=>value-1)}>Previous</Button><span className="text-sm">Page {page} of {query.data.meta.last_page || 1}</span><Button variant="outline" disabled={page >= query.data.meta.last_page || query.isFetching} onClick={()=>setPage(value=>value+1)}>Next</Button></nav>
    </>}
  </FamilyFrame>;
}
export function BhcFamilyDetails() {
  const {householdId}=useParams();
  const scope=useBhcHouseholdScope();
  const access=useAccess();
  const navigate=useNavigate();
  const [view,setView]=useState('tree');
  const [transferring,setTransferring]=useState(null);
  const query=useQuery({queryKey:[...scope.key,'detail',householdId],queryFn:()=>getHouseholdById(householdId),retry:false});
  const item=query.data;
  const graph=useMemo(()=>buildFamilyGraph(item),[item]);
  const head=item?.members.find(member=>member.id === item.headPatientId);
  const tabs=[['tree','Family Tree'],['list','Members List']];
  const openMember=id=>navigate(`/bhc/patients/${id}?tab=patient-info`);
  function moveTab(event) {
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const next=event.key === 'Home' ? 'tree' : event.key === 'End' ? 'list' : view === 'tree' ? 'list' : 'tree';
    setView(next);document.getElementById(`family-tab-${next}`)?.focus();
  }
  return <FamilyFrame title="Family Details"><BackLink/>{query.isPending || query.error ? <QueryState query={query}/> : item.archivedAt ? <p role="status">This household is archived.</p> : <>
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-normal tracking-tight">{head ? `${head.lastName} Household` : 'Household'}</h1><p className="mt-2 font-mono text-sm text-neutral-500">{item.serialNumber}</p></div><div className="flex flex-wrap gap-2">{access.can('families.manage') && <Button asChild variant="outline"><Link to={`${base}/${item.id}/edit`}>Edit Family</Link></Button>}{access.can('patients.register') && <Button asChild><Link to={`/bhc/patients/add?household=${item.id}`}><Plus size={17}/>Register Member</Link></Button>}</div></header>
    <dl className="grid gap-5 border-y border-neutral-200 py-5 sm:grid-cols-3"><div><dt className="text-xs text-neutral-500">Household head</dt><dd className="mt-2 text-sm">{head ? patientName(head) : 'Not assigned'}</dd></div><div><dt className="text-xs text-neutral-500">Address</dt><dd className="mt-2 text-sm">{addressText(item.address)}</dd></div><div><dt className="text-xs text-neutral-500">Members</dt><dd className="mt-2 text-sm">{item.members.length}</dd></div></dl>
    <div role="tablist" aria-label="Family view" className="flex gap-7 border-b border-neutral-200">{tabs.map(([key,label])=><button key={key} type="button" role="tab" id={`family-tab-${key}`} aria-selected={view === key} aria-controls={`family-panel-${key}`} tabIndex={view === key ? 0 : -1} onClick={()=>setView(key)} onKeyDown={moveTab} className={`border-b-2 pb-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${view === key ? 'border-red-700 text-red-700' : 'border-transparent text-neutral-500'}`}>{label}</button>)}</div>
    <section role="tabpanel" id={`family-panel-${view}`} aria-labelledby={`family-tab-${view}`}>{view === 'tree'
      ? <FamilyTreeCanvas members={graph.members} edges={graph.edges} headId={item.headPatientId} onOpenMember={openMember}/>
      : <FamilyMembersList members={graph.members} headId={item.headPatientId} canManage={access.can('families.manage')} canTransfer={access.can('patients.register')} onTransfer={setTransferring} familyPath={`${base}/${item.id}`}/>}</section>
    {transferring && <TransferHouseholdModal member={transferring} household={item} onClose={()=>setTransferring(null)}/>}
  </>}</FamilyFrame>;
}
function Field({name,label,error,children}) {
  return <div className="space-y-1.5"><label htmlFor={name} className="block text-sm font-medium">{label}</label>{children}{error && <p id={`${name}-error`} role="alert" className="text-xs text-red-700">{Array.isArray(error) ? error[0] : error}</p>}</div>;
}
export function BhcFamilyForm() {
  const {householdId}=useParams();
  const scope=useBhcHouseholdScope();
  const query=useQuery({queryKey:[...scope.key,'detail',householdId],queryFn:()=>getHouseholdById(householdId),enabled:Boolean(householdId),retry:false});
  if(householdId && !query.data && (query.isPending || query.error)) return <FamilyFrame title="Edit Family"><BackLink/><QueryState query={query}/></FamilyFrame>;
  return <FamilyEditor key={`${scope.identity}:${householdId || 'new'}`} scope={scope} initialItem={query.data} refreshError={Boolean(query.error)} onRefresh={()=>query.refetch()}/>;
}
function FamilyEditor({scope,initialItem,refreshError,onRefresh}) {
  // Keep the version paired with this draft. Background refresh must not erase it.
  const [item]=useState(initialItem);
  const client=useQueryClient();
  const navigate=useNavigate();
  const [draft,setDraft]=useState({serial_mode:'auto',serial_number:item?.serialNumber || '',address:addressValues(item?.address),head_patient_id:item?.headPatientId || '',relationships:{}});
  const [errors,setErrors]=useState({});
  const [conflict,setConflict]=useState(false);
  const [search,setSearch]=useState('');
  const [submitted,setSubmitted]=useState(null);
  const [chosenHead,setChosenHead]=useState(null);
  const candidates=useQuery({queryKey:[...scope.key,'candidates',submitted],queryFn:()=>getHouseholdCandidates(submitted),enabled:!item && submitted !== null,retry:false});
  const mutation=useMutation({mutationFn:()=>saveHousehold({...draft,...(item ? {version:item.version} : {}),...(draft.serial_mode === 'auto' && !item ? {serial_number:undefined} : {})},item?.id),onSuccess:async household=>{
    await Promise.all([client.invalidateQueries({queryKey:scope.key}),client.invalidateQueries({queryKey:['patients','bhc']}),client.invalidateQueries({queryKey:['patient-details','bhc']})]);
    toast.success(item ? 'Family updated.' : 'Family created.');navigate(`${base}/${household.id}`,{replace:true});
  },onError:error=>{setConflict(error.status === 409);setErrors(Object.keys(error.errors || {}).length ? error.errors : {form:error.message});}});
  function change(key,value) {setDraft(previous=>({...previous,[key]:value}));setErrors(previous=>({...previous,[key]:undefined}));}
  function errorFor(key) {return errors[key] || errors[`household.${key}`];}
  function inputProps(key) {return {id:key,'aria-invalid':Boolean(errorFor(key)),'aria-describedby':errorFor(key) ? `${key}-error` : undefined};}
  return <FamilyFrame title={item ? 'Edit Family':'Add Family'}><BackLink to={item ? `${base}/${item.id}` : base}/><h1 className="text-3xl font-normal tracking-tight">{item ? 'Edit Family':'Add Family'}</h1>
    <form className="max-w-3xl space-y-6" noValidate onSubmit={event=>{event.preventDefault();if(!mutation.isPending) {setErrors({});mutation.mutate();}}}>
      {refreshError && <div className="space-y-2 text-sm text-red-700"><p role="status">Saved family data could not refresh. Your draft is kept.</p><Button type="button" variant="outline" onClick={onRefresh}>Retry refresh</Button></div>}
      {!item && <section className="space-y-3"><label htmlFor="head-search" className="block text-sm font-medium">Choose a registered household head</label><div className="flex gap-2"><Input id="head-search" type="search" placeholder="Search patient name" value={search} onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key === 'Enter'){event.preventDefault();if(submitted === search)candidates.refetch();else setSubmitted(search);}}}/><Button type="button" variant="outline" onClick={()=>{setSubmitted(search);if(submitted === search)candidates.refetch();}}>Search</Button></div>{candidates.isFetching ? <p role="status" className="text-sm">Searching patients…</p> : candidates.error ? <p role="alert" className="text-sm text-red-700">Unable to search patients. Select Search to retry.</p> : submitted !== null && <div className="max-h-64 overflow-y-auto divide-y divide-neutral-200 border-y border-neutral-200">{candidates.data?.length ? candidates.data.map(patient=>{
        const eligibility=canHeadHousehold(patient);
        const isHead=String(patient.household?.head_patient_id || '') === patient.id;
        const blockedHead=isHead && Number(patient.household?.members_count || 0) > 1;
        return <button type="button" key={patient.id} disabled={!eligibility.ok || blockedHead} aria-pressed={draft.head_patient_id === patient.id} onClick={()=>{setChosenHead(patient);setDraft(previous=>({...previous,head_patient_id:patient.id,address:addressValues(patient)}));setErrors({});}} className={`block w-full px-3 py-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-50 ${draft.head_patient_id === patient.id ? 'bg-red-50 text-red-900':'hover:bg-neutral-50'}`}><span className="font-medium">{patientName(patient)}</span><span className="mt-1 block text-xs">{!eligibility.ok ? eligibility.reason : blockedHead ? 'Assign a new head in Edit Family first.' : patient.familySerialNumber ? `Currently in ${patient.familySerialNumber}. This patient will move to the new household.` : 'No household assigned'}</span></button>;
      }) : <p className="py-5 text-sm text-neutral-500">No matching patients.</p>}</div>}{chosenHead && <p className="text-sm font-medium">Selected head: {patientName(chosenHead)}</p>}{errorFor('head_patient_id') && <p role="alert" className="text-xs text-red-700">{errorFor('head_patient_id')}</p>}</section>}
      <section className="space-y-3"><Field name="serial_number" label="Family Serial Number" error={errorFor('serial_number')}><Input {...inputProps('serial_number')} readOnly={!item && draft.serial_mode === 'auto'} value={!item && draft.serial_mode === 'auto' ? 'Assigned automatically on save' : draft.serial_number} maxLength={100} onChange={event=>change('serial_number',event.target.value)}/></Field>{!item && <><Button type="button" variant="outline" onClick={()=>setDraft(previous=>({...previous,serial_mode:previous.serial_mode === 'auto' ? 'manual':'auto',serial_number:''}))}>{draft.serial_mode === 'auto' ? 'Enter manually':'Use automatic FSN'}</Button><p className="text-xs text-neutral-500">Automatic format: FSN-YYYY-NNNN. Your BHC assigns the number when this family is saved.</p></>}{item && <p className="text-xs text-neutral-500">Correcting the FSN updates all linked members and keeps their household connection.</p>}</section>
      <div className="grid gap-5 sm:grid-cols-2">{[['streetAddress','House / Street'],['purokArea','Purok / Area'],['barangay','Barangay'],['municipality','Municipality']].map(([key,label])=><Field key={key} name={`address.${key}`} label={label} error={errorFor(`address.${key}`)}><Input {...inputProps(`address.${key}`)} required value={draft.address[key]} onChange={event=>{change('address',{...draft.address,[key]:event.target.value});setErrors(previous=>({...previous,[`address.${key}`]:undefined}));}}/></Field>)}</div>
      {item && <section className="space-y-4"><Field name="head_patient_id" label="Household head" error={errorFor('head_patient_id')}><select {...inputProps('head_patient_id')} value={draft.head_patient_id} onChange={event=>{change('head_patient_id',event.target.value);change('relationships',{});}} className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"><option value="">Select head</option>{item.members.map(member=><option key={member.id} value={member.id}>{patientName(member)}</option>)}</select></Field>{draft.head_patient_id !== item.headPatientId && item.members.filter(member=>member.id !== draft.head_patient_id).map(member=><Field key={member.id} name={`relationships.${member.id}`} label={`${patientName(member)} — relationship to new head`} error={errorFor(`relationships.${member.id}`)}><select {...inputProps(`relationships.${member.id}`)} value={draft.relationships[member.id] || ''} onChange={event=>change('relationships',{...draft.relationships,[member.id]:event.target.value})} className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"><option value="">Select relationship</option>{RELATIONSHIP_LABELS.map(value=><option key={value}>{value}</option>)}</select></Field>)}</section>}
      {errors.form && <p role="alert" className="text-sm text-red-700">{errors.form}</p>}{conflict && <Button type="button" variant="outline" onClick={()=>window.location.reload()}>Reload saved family and discard this draft</Button>}<div className="flex justify-end gap-3 border-t border-neutral-200 pt-5"><Button asChild variant="ghost"><Link to={item ? `${base}/${item.id}`:base}>Cancel</Link></Button><Button disabled={mutation.isPending || conflict} type="submit">{mutation.isPending ? 'Saving…':'Save Family'}</Button></div>
    </form></FamilyFrame>;
}
export function BhcAddMember() {
  const {householdId}=useParams();
  return <Navigate replace to={`/bhc/patients/add?household=${householdId}`}/>;
}
export function BhcDeferredFamilyAction() {
  const {householdId}=useParams();
  return <FamilyFrame title="Family Connections"><BackLink to={`${base}/${householdId}`}>Back to Family</BackLink><p role="status">Relationship editing is not available yet. Household membership is managed through patient registration.</p></FamilyFrame>;
}
