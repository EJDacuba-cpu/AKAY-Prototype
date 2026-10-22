import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useBlocker, useNavigate, useParams } from 'react-router';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MapPin, Plus, Search, User, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { ConnectionErrorState, RefreshingIndicator } from '../../components/common';
import NoticeModal from '../../components/common/modals/NoticeModal';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import useAccess from '../../hooks/useAccess';
import useHouseholdScope from '../../hooks/useBhcHouseholdScope';
import { getHouseholds, getHouseholdById, saveHousehold, getHouseholdCandidates } from '../../services/householdService';
import FamilyTreeCanvas from '../../components/features/families/FamilyTreeCanvas';
import FamilyDirectoryTable from '../../components/features/families/FamilyDirectoryTable';
import FamilyDirectoryFilter from '../../components/features/families/FamilyDirectoryFilter';
import FamilyMembersList from '../../components/features/families/FamilyMembersList';
import TransferHouseholdModal from '../../components/features/families/TransferHouseholdModal';
import { buildFamilyGraph } from '../../utils/familyGraph';
import { RELATIONSHIP_LABELS } from '../../utils/relationshipLabels';
import { errorStateVariant } from '../../utils/errorStateVariant';
import { queryKeys } from '../../utils/queryKeys';
import { addressText, addressValues, canHeadHousehold, NO_PUROK_FILTER, patientName } from '../../services/familyRegistry';

const NO_FILTERS={purok:'',barangay:''};
const NO_SORT={key:'',direction:'asc'};
const familyBase = role => `/${role}/families`;
const facilityLabel = role => role === 'rhu' ? 'RHU' : 'BHC';
function FamilyFrame({role='bhc',title,children}) {
  return <DashboardLayout role={role} title={title}><div className="mx-auto max-w-[1440px] space-y-5 text-neutral-900">{children}</div></DashboardLayout>;
}
const TITLE='text-2xl font-bold leading-tight tracking-tight text-ink-800';
const HEADING='text-sm font-bold text-ink-800';
const pulse='animate-pulse rounded-card bg-neutral-100';
const SHEET='rounded-card border border-neutral-200 bg-white shadow-[var(--shadow-card)]';
const DirectorySkeleton=<div className={`${SHEET} min-h-[324px] overflow-hidden`}><div className="h-11 bg-neutral-100"/>{[0,1,2,3,4].map(key=><div key={key} className="flex h-14 items-center gap-6 border-t border-neutral-200 px-4"><div className="h-3 w-24 animate-pulse rounded bg-neutral-100"/><div className="h-3 w-48 animate-pulse rounded bg-neutral-100"/><div className="hidden h-3 w-64 animate-pulse rounded bg-neutral-100 md:block"/></div>)}</div>;
const DetailsSkeleton=<div className="space-y-5"><div className={`${pulse} h-16`}/><div className={`${pulse} h-64`}/></div>;
const FormSkeleton=<div className="max-w-3xl space-y-5"><div className={`${pulse} h-48`}/><div className={`${pulse} h-24`}/></div>;
export function QueryState({query,label='Loading households…',skeleton}) {
  if(query.error) {
    // A 404 has nothing to retry; the back link above is the way out.
    const missing=query.error.status === 404;
    return <div role="alert" className="rounded-card border border-neutral-200 bg-white"><ConnectionErrorState size="compact" variant={errorStateVariant(query.error)} title={missing ? 'Household not found' : undefined} message={missing ? 'We could not find this household. Go back to Families and choose another.' : undefined} onRetry={missing ? undefined : ()=>query.refetch()} retrying={query.isFetching}/></div>;
  }
  return <div role="status"><span className="sr-only">{label}</span><div aria-hidden="true">{skeleton}</div></div>;
}
function BackLink({to,children='Back to Families'}) {
  return <Link to={to} className="inline-flex min-h-10 items-center gap-2 text-sm text-neutral-600"><ArrowLeft size={16}/>{children}</Link>;
}
export function BhcFamiliesDirectory({role='bhc'}={}) {
  const scope=useHouseholdScope(role);
  return <Directory key={scope.identity} scope={scope} role={role}/>;
}
function Directory({scope,role}) {
  const access=useAccess();
  const base=familyBase(role);
  const [draft,setDraft]=useState('');
  const [search,setSearch]=useState('');
  const [filters,setFilters]=useState(NO_FILTERS);
  const [sort,setSort]=useState(NO_SORT);
  // Search applies as the user types; Enter applies it at once.
  useEffect(()=>{const timer=setTimeout(()=>setSearch(draft.trim()),300);return ()=>clearTimeout(timer);},[draft]);
  const noPurok=filters.purok === NO_PUROK_FILTER;
  const query=useInfiniteQuery({
    queryKey:[...scope.key,'list',search,filters.purok,filters.barangay,sort.key,sort.direction],
    queryFn:({pageParam})=>getHouseholds({role,search,page:pageParam,barangay:filters.barangay,purok:noPurok ? '' : filters.purok,withoutPurok:noPurok,sort:sort.key,direction:sort.direction}),
    initialPageParam:1,
    getNextPageParam:last=>last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined,
    retry:false,placeholderData:keepPreviousData,
  });
  const pages=query.data?.pages || [];
  // A household registered while paging can shift later pages, so repeats are dropped.
  const items=[...new Map(pages.flatMap(entry=>entry.items).map(item=>[item.id,item])).values()];
  const total=pages.at(-1)?.meta.total || 0;
  const options=pages[0]?.meta.filters || {puroks:[],barangays:[],hasWithoutPurok:false};
  const chips=[
    filters.purok && {key:'purok',label:noPurok ? 'No purok recorded' : `Purok: ${filters.purok}`},
    filters.barangay && {key:'barangay',label:`Barangay: ${filters.barangay}`},
  ].filter(Boolean);
  const narrowed=Boolean(search) || chips.length > 0;
  const emptyRegistry=!narrowed && total === 0;
  const hasFilterChoices=options.puroks.length > 0 || options.hasWithoutPurok || options.barangays.length > 1 || chips.length > 0;
  function clearAll() {setDraft('');setSearch('');setFilters(NO_FILTERS);}
  // Ascending, then descending, then back to newest first.
  function toggleSort(key) {setSort(previous=>previous.key !== key ? {key,direction:'asc'} : previous.direction === 'asc' ? {key,direction:'desc'} : NO_SORT);}
  return <FamilyFrame role={role} title="Families">
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3"><div className="min-w-0"><h1 className={TITLE}>Families</h1><p className="mt-1 text-[13px] text-neutral-600">Households registered in your {facilityLabel(role)}. Open one to see its members and family tree.</p></div>{access.can('families.manage') && <Button asChild variant="brand"><Link to={`${base}/new`}><Plus size={17}/>Add Family</Link></Button>}</header>
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-[var(--color-bg)] py-2">
      {/* Left: what is narrowing the list. The count is announced to screen readers but not drawn. */}
      <div className="flex min-h-10 min-w-0 flex-wrap items-center gap-2">{!query.isPending && !query.error && <>
        <p role="status" className="sr-only">{total} {total === 1 ? 'household' : 'households'}{narrowed ? ' found' : ''}</p>
        {chips.map(chip=><span key={chip.key} className="inline-flex h-7 items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 pl-3 pr-1 text-xs text-ink-800">{chip.label}<button type="button" aria-label={`Remove filter ${chip.label}`} onClick={()=>setFilters(previous=>({...previous,[chip.key]:''}))} className="flex h-5 w-5 items-center justify-center rounded-full text-neutral-500 outline-none hover:bg-neutral-200 hover:text-ink-800 focus-visible:ring-2 focus-visible:ring-ink-400/50"><X size={12} aria-hidden="true"/></button></span>)}
        {narrowed && items.length > 0 && <Button type="button" variant="ghost" size="compact" onClick={clearAll}>Clear all</Button>}
        {query.isFetching && !query.isFetchingNextPage && <RefreshingIndicator label="Updating…"/>}
      </>}</div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-none"><form className="relative min-w-0 flex-1 basis-64 sm:w-96 sm:flex-none" role="search" onSubmit={event=>{event.preventDefault();setSearch(draft.trim());}}><Search size={17} aria-hidden="true" className="absolute left-3 top-3 text-neutral-500"/><Input type="search" value={draft} onChange={event=>setDraft(event.target.value)} aria-label="Search families" placeholder="Search FSN, household head or address" className="h-10 pl-10"/></form>{hasFilterChoices && <FamilyDirectoryFilter applied={filters} options={options} onApply={setFilters}/>}</div>
    </div>
    {query.isPending || query.error ? <QueryState query={query} skeleton={DirectorySkeleton}/> : <>
      {items.length ? <FamilyDirectoryTable items={items} base={base} dimmed={query.isPlaceholderData} sort={sort} onSort={toggleSort} footer={query.hasNextPage && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3"><p className="text-sm text-neutral-500">Showing {items.length} of {total}</p><Button variant="secondary" size="sm" disabled={query.isFetchingNextPage} onClick={()=>query.fetchNextPage()}>{query.isFetchingNextPage ? 'Loading…' : 'Show more'}</Button></div>}/> : <div className={`${SHEET} flex min-h-[324px] flex-col items-center justify-center gap-2 px-6 py-12 text-center`}><h2 className="text-sm font-semibold text-ink-800">{emptyRegistry ? 'No families registered yet' : 'No households found'}</h2><p className="max-w-sm text-[13px] text-neutral-500">{emptyRegistry ? 'Register a patient to start the first household, or use Add Family for a patient who is already registered.' : 'Try a different search, or clear the search and filters.'}</p>{narrowed && <Button variant="secondary" size="sm" className="mt-2" onClick={clearAll}>Clear search and filters</Button>}</div>}
    </>}
  </FamilyFrame>;
}
export function BhcFamilyDetails({role='bhc'}={}) {
  const {householdId}=useParams();
  const scope=useHouseholdScope(role);
  const access=useAccess();
  const navigate=useNavigate();
  const base=familyBase(role);
  const [view,setView]=useState('tree');
  const [transferring,setTransferring]=useState(null);
  const query=useQuery({queryKey:[...scope.key,'detail',householdId],queryFn:()=>getHouseholdById(householdId, role),retry:false});
  const item=query.data;
  const graph=useMemo(()=>buildFamilyGraph(item),[item]);
  const head=item?.members.find(member=>member.id === item.headPatientId);
  const tabs=[['tree','Family Tree'],['list','Members List']];
  const openMember=id=>navigate(`/${role}/patients/${id}?tab=patient-info`);
  function moveTab(event) {
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const next=event.key === 'Home' ? 'tree' : event.key === 'End' ? 'list' : view === 'tree' ? 'list' : 'tree';
    setView(next);document.getElementById(`family-tab-${next}`)?.focus();
  }
  const viewTabs=<div role="tablist" aria-label="Family view" className="inline-flex gap-1 rounded-full border border-neutral-200 bg-neutral-100 p-1">{tabs.map(([key,label])=><button key={key} type="button" role="tab" id={`family-tab-${key}`} aria-selected={view === key} aria-controls={`family-panel-${key}`} tabIndex={view === key ? 0 : -1} onClick={()=>setView(key)} onKeyDown={moveTab} className={`h-7 rounded-full px-4 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink-400/50 ${view === key ? 'bg-ink-700 text-white' : 'text-neutral-600 hover:text-neutral-900'}`}>{label}</button>)}</div>;
  return <FamilyFrame role={role} title="Family Details"><BackLink to={base}/>{query.isPending || query.error ? <QueryState query={query} label="Loading household…" skeleton={DetailsSkeleton}/> : item.archivedAt ? <p role="status" className={`${SHEET} px-6 py-10 text-center text-sm text-neutral-600`}>This household is archived.</p> : <>
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2.5"><h1 className={TITLE}>{head ? `${head.lastName} Household` : 'Household'}</h1><span className="rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-0.5 font-mono text-xs text-neutral-600">{item.serialNumber}</span></div>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-neutral-600"><span className="inline-flex items-center gap-1.5"><User size={14} className="text-neutral-500" aria-hidden="true"/>Head: <b className="font-semibold text-ink-800">{head ? patientName(head) : 'Not assigned'}</b></span><span className="inline-flex min-w-0 items-center gap-1.5"><MapPin size={14} className="shrink-0 text-neutral-500" aria-hidden="true"/>{addressText(item.address) || 'No address recorded'}</span><span className="inline-flex items-center gap-1.5"><Users size={14} className="text-neutral-500" aria-hidden="true"/>{item.members.length} {item.members.length === 1 ? 'member' : 'members'}</span></p></div>
      <div className="flex flex-wrap gap-2">{access.can('families.manage') && <Button asChild variant="secondary"><Link to={`${base}/${item.id}/edit`}>Edit Family</Link></Button>}{access.can('patients.register') && <Button asChild variant="brand"><Link to={`/${role}/patients/add?household=${item.id}`}><Plus size={17}/>Register Member</Link></Button>}</div></header>
    <section id={`family-panel-${view}`} className="space-y-3" aria-label="Household members">{view === 'tree'
      ? <FamilyTreeCanvas leading={viewTabs} members={graph.members} edges={graph.edges} headId={item.headPatientId} onOpenMember={openMember} canManage={access.can('families.manage')} familyPath={`${base}/${item.id}`}/>
      : <>{viewTabs}<FamilyMembersList members={graph.members} headId={item.headPatientId} canManage={access.can('families.manage')} canTransfer={access.can('patients.register')} onTransfer={setTransferring} familyPath={`${base}/${item.id}`} patientPath={`/${role}/patients`}/></>}</section>
    {transferring && <TransferHouseholdModal role={role} member={transferring} household={item} onClose={()=>setTransferring(null)}/>}
  </>}</FamilyFrame>;
}
function Field({name,label,error,children}) {
  return <div className="space-y-1.5"><label htmlFor={name} className="block text-sm font-medium">{label}</label>{children}{error && <p id={`${name}-error`} role="alert" className="text-xs text-red-700">{Array.isArray(error) ? error[0] : error}</p>}</div>;
}
export function BhcFamilyForm({role='bhc'}={}) {
  const {householdId}=useParams();
  const scope=useHouseholdScope(role);
  const query=useQuery({queryKey:[...scope.key,'detail',householdId],queryFn:()=>getHouseholdById(householdId, role),enabled:Boolean(householdId),retry:false});
  if(householdId && !query.data && (query.isPending || query.error)) return <FamilyFrame role={role} title="Edit Family"><BackLink to={familyBase(role)}/><QueryState query={query} label="Loading household…" skeleton={FormSkeleton}/></FamilyFrame>;
  return <FamilyEditor key={`${scope.identity}:${householdId || 'new'}`} scope={scope} role={role} initialItem={query.data} refreshError={Boolean(query.error)} onRefresh={()=>query.refetch()}/>;
}
function FamilyEditor({scope,role,initialItem,refreshError,onRefresh}) {
  // Keep the version paired with this draft. Background refresh must not erase it.
  const [item]=useState(initialItem);
  const client=useQueryClient();
  const navigate=useNavigate();
  const base=familyBase(role);
  const [draft,setDraft]=useState({serial_mode:'auto',serial_number:item?.serialNumber || '',address:addressValues(item?.address),head_patient_id:item?.headPatientId || '',relationships:{}});
  const [errors,setErrors]=useState({});
  const [conflict,setConflict]=useState(false);
  const [search,setSearch]=useState('');
  const [submitted,setSubmitted]=useState(null);
  const [chosenHead,setChosenHead]=useState(null);
  const candidates=useQuery({queryKey:[...scope.key,'candidates',submitted],queryFn:()=>getHouseholdCandidates(submitted, role),enabled:!item && submitted !== null,retry:false});
  const mutation=useMutation({mutationFn:()=>saveHousehold({...draft,...(item ? {version:item.version} : {}),...(draft.serial_mode === 'auto' && !item ? {serial_number:undefined} : {})},item?.id, role),onSuccess:async household=>{
    savedRef.current=true;
    await Promise.all([client.invalidateQueries({queryKey:scope.key}),client.invalidateQueries({queryKey:queryKeys.patients(role)}),client.invalidateQueries({queryKey:['patient-details',role]})]);
    toast.success(item ? 'Family updated.' : 'Family created.');navigate(`${base}/${household.id}`,{replace:true});
  },onError:error=>{setConflict(error.status === 409);setErrors(Object.keys(error.errors || {}).length ? error.errors : {form:error.message});}});
  const [startDraft]=useState(()=>JSON.stringify(draft));
  const savedRef=useRef(false);
  const dirty=JSON.stringify(draft) !== startDraft;
  // Leaving with unsaved edits asks first; a successful save marks the draft as saved before it navigates away.
  const blocker=useBlocker(({currentLocation,nextLocation})=>dirty && !savedRef.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(()=>{if(!dirty) return undefined;const warn=event=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return ()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  function change(key,value) {setDraft(previous=>({...previous,[key]:value}));setErrors(previous=>({...previous,[key]:undefined}));}
  function errorFor(key) {return errors[key] || errors[`household.${key}`];}
  function inputProps(key) {return {id:key,'aria-invalid':Boolean(errorFor(key)),'aria-describedby':errorFor(key) ? `${key}-error` : undefined};}
  return <FamilyFrame role={role} title={item ? 'Edit Family':'Add Family'}><BackLink to={item ? `${base}/${item.id}` : base}/><h1 className={TITLE}>{item ? 'Edit Family':'Add Family'}</h1>
    <form className="max-w-3xl space-y-5" noValidate onSubmit={event=>{event.preventDefault();if(!mutation.isPending) {setErrors({});mutation.mutate();}}}>
      {refreshError && <div className="space-y-2 text-sm text-red-700"><p role="status">Saved family data could not refresh. Your draft is kept.</p><Button type="button" variant="secondary" size="sm" onClick={onRefresh}>Retry refresh</Button></div>}
      {!item && <section className={`${SHEET} space-y-3 p-5`}><h2 className={HEADING}>Household head</h2><label htmlFor="head-search" className="block text-sm font-medium">Search registered patients</label><div className="flex gap-2"><Input id="head-search" type="search" placeholder="Search patient name" value={search} onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key === 'Enter'){event.preventDefault();if(submitted === search)candidates.refetch();else setSubmitted(search);}}}/><Button type="button" variant="secondary" className="h-11" onClick={()=>{setSubmitted(search);if(submitted === search)candidates.refetch();}}>Search</Button></div>{candidates.isFetching ? <p role="status" className="text-sm">Searching patients…</p> : candidates.error ? <p role="alert" className="text-sm text-red-700">Unable to search patients. Select Search to retry.</p> : submitted !== null && <div className="max-h-64 overflow-y-auto divide-y divide-neutral-200 border-y border-neutral-200">{candidates.data?.length ? candidates.data.map(patient=>{
        const eligibility=canHeadHousehold(patient);
        const isHead=String(patient.household?.head_patient_id || '') === patient.id;
        const blockedHead=isHead && Number(patient.household?.members_count || 0) > 1;
        return <button type="button" key={patient.id} disabled={!eligibility.ok || blockedHead} aria-pressed={draft.head_patient_id === patient.id} onClick={()=>{setChosenHead(patient);setDraft(previous=>({...previous,head_patient_id:patient.id,address:addressValues(patient)}));setErrors({});}} className={`block w-full px-3 py-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-400/50 disabled:opacity-50 ${draft.head_patient_id === patient.id ? 'bg-neutral-100 text-ink-800 ring-1 ring-inset ring-ink-400':'hover:bg-neutral-50'}`}><span className="font-medium">{patientName(patient)}</span><span className="mt-1 block text-xs">{!eligibility.ok ? eligibility.reason : blockedHead ? 'Assign a new head in Edit Family first.' : patient.familySerialNumber ? `Currently in ${patient.familySerialNumber}. This patient will move to the new household.` : 'No household assigned'}</span></button>;
      }) : <p className="py-5 text-sm text-neutral-500">No matching patients.</p>}</div>}{chosenHead && <p className="text-sm font-medium">Selected head: {patientName(chosenHead)}</p>}{errorFor('head_patient_id') && <p role="alert" className="text-xs text-red-700">{errorFor('head_patient_id')}</p>}</section>}
      <div className={`${SHEET} space-y-5 p-5`}><h2 className={HEADING}>Household details</h2><section className="space-y-3"><Field name="serial_number" label="Family Serial Number" error={errorFor('serial_number')}><Input {...inputProps('serial_number')} readOnly={!item && draft.serial_mode === 'auto'} value={!item && draft.serial_mode === 'auto' ? 'Assigned automatically on save' : draft.serial_number} maxLength={100} onChange={event=>change('serial_number',event.target.value)}/></Field>{!item && <><Button type="button" variant="secondary" size="sm" onClick={()=>setDraft(previous=>({...previous,serial_mode:previous.serial_mode === 'auto' ? 'manual':'auto',serial_number:''}))}>{draft.serial_mode === 'auto' ? 'Enter manually':'Use automatic FSN'}</Button><p className="text-xs text-neutral-500">Automatic format: FSN-YYYY-NNNN. Your {facilityLabel(role)} assigns the number when this family is saved.</p></>}{item && <p className="text-xs text-neutral-500">Correcting the FSN updates all linked members and keeps their household connection.</p>}</section>
      <div className="grid gap-5 sm:grid-cols-2">{[['streetAddress','House / Street'],['purokArea','Purok / Area (optional)'],['barangay','Barangay'],['municipality','Municipality']].map(([key,label])=><Field key={key} name={`address.${key}`} label={label} error={errorFor(`address.${key}`)}><Input {...inputProps(`address.${key}`)} required={key !== 'purokArea'} value={draft.address[key]} onChange={event=>{change('address',{...draft.address,[key]:event.target.value});setErrors(previous=>({...previous,[`address.${key}`]:undefined}));}}/></Field>)}</div></div>
      {item && <section className={`${SHEET} space-y-4 p-5`}><h2 className={HEADING}>Household head</h2><Field name="head_patient_id" label="Current head" error={errorFor('head_patient_id')}><Select {...inputProps('head_patient_id')} value={draft.head_patient_id} onChange={event=>{change('head_patient_id',event.target.value);change('relationships',{});}}><option value="">Select head</option>{item.members.map(member=><option key={member.id} value={member.id}>{patientName(member)}</option>)}</Select></Field>{draft.head_patient_id !== item.headPatientId && item.members.filter(member=>member.id !== draft.head_patient_id).map(member=><Field key={member.id} name={`relationships.${member.id}`} label={`${patientName(member)} — relationship to new head`} error={errorFor(`relationships.${member.id}`)}><Select {...inputProps(`relationships.${member.id}`)} value={draft.relationships[member.id] || ''} onChange={event=>change('relationships',{...draft.relationships,[member.id]:event.target.value})}><option value="">Select relationship</option>{RELATIONSHIP_LABELS.map(value=><option key={value}>{value}</option>)}</Select></Field>)}</section>}
      {errors.form && <p role="alert" className="text-sm text-red-700">{errors.form}</p>}{conflict && <Button type="button" variant="secondary" onClick={()=>window.location.reload()}>Reload saved family and discard this draft</Button>}<div className="flex justify-end gap-3"><Button asChild variant="secondary"><Link to={item ? `${base}/${item.id}`:base}>Cancel</Link></Button><Button variant="brand" disabled={mutation.isPending || conflict} type="submit">{mutation.isPending ? 'Saving…':'Save Family'}</Button></div>
    </form>
    <NoticeModal open={blocker.state === 'blocked'} title="Leave without saving?" message="This family has unsaved changes. If you leave now, they will be lost." onClose={()=>{}} dismissOnBackdrop={false} actions={[{label:'Keep Editing',variant:'secondary',onClick:()=>blocker.reset?.()},{label:'Discard Changes',variant:'destructive',onClick:()=>blocker.proceed?.()}]}/>
  </FamilyFrame>;
}
export function BhcAddMember({role='bhc'}={}) {
  const {householdId}=useParams();
  return <Navigate replace to={`/${role}/patients/add?household=${householdId}`}/>;
}
export function BhcDeferredFamilyAction({role='bhc'}={}) {
  const {householdId}=useParams();
  return <FamilyFrame role={role} title="Family Connections"><BackLink to={`${familyBase(role)}/${householdId}`}>Back to Family</BackLink><p role="status">Relationship editing is not available yet. Household membership is managed through patient registration.</p></FamilyFrame>;
}
