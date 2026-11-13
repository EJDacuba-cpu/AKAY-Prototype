import { PatientRegistrationEntryLink as Link } from "../../components/features/patients/PatientRegistrationEntry";
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MapPin, Plus, User, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { ConnectionErrorState, PageSkeletonLoader, RefreshingIndicator, SearchField, SearchFilterCluster, TablePagination } from '../../components/common';
import NoticeModal from '../../components/common/modals/NoticeModal';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import useAccess from '../../hooks/useAccess';
import useMediaQuery from '../../hooks/useMediaQuery';
import useHouseholdScope from '../../hooks/useBhcHouseholdScope';
import { getHouseholds, getHouseholdById, saveHousehold, getHouseholdCandidates } from '../../services/householdService';
import FamilyTreeCanvas from '../../components/features/families/FamilyTreeCanvas';
import FamilyDirectoryTable from '../../components/features/families/FamilyDirectoryTable';
import FamilyDirectoryFilter from '../../components/features/families/FamilyDirectoryFilter';
import FamilyMembersList from '../../components/features/families/FamilyMembersList';
import TransferHouseholdModal from '../../components/features/families/TransferHouseholdModal';
import AddExistingMemberModal from '../../components/features/families/AddExistingMemberModal';
import { RELATIONSHIP_LABELS } from '../../utils/relationshipLabels';
import { errorStateVariant } from '../../utils/errorStateVariant';
import { queryKeys } from '../../utils/queryKeys';
import { addressText, addressValues, canHeadHousehold, NO_PUROK_FILTER, patientName } from '../../services/familyRegistry';
import { TABLE_PAGE_SIZE, clampPage, resetKeyOf, tableBodyHeight } from '../../utils/tablePaging';

const DESKTOP_QUERY='(min-width: 1024px)';
const NO_FILTERS={purok:'',barangay:''};
const familyBase = role => `/${role}/families`;
const facilityLabel = role => role === 'rhu' ? 'RHU' : 'BHC';
const accessDenied = error => [401,403].includes(Number(error?.status));
function FamilyFrame({role='bhc',title,children}) {
  return <DashboardLayout role={role} title={title}><div className="w-full min-w-0 space-y-5 text-neutral-900">{children}</div></DashboardLayout>;
}
const TITLE='text-2xl font-bold leading-tight tracking-tight text-ink-800';
const HEADING='text-sm font-bold text-ink-800';
const SHEET='rounded-card border border-neutral-200 bg-white shadow-[var(--shadow-card)]';
export function QueryState({query,label='Loading households…',skeleton='family-directory',bodyOnly=false,options={},size='page'}) {
  if(query.error) {
    // A 404 has nothing to retry; the back link above is the way out.
    const missing=query.error.status === 404;
    return <ConnectionErrorState fullPage={size !== 'compact'} size={size === 'compact' ? 'compact' : 'page'} variant={errorStateVariant(query.error)} title={missing ? 'Household not found' : undefined} message={missing ? 'We could not find this household. Go back to Households and choose another.' : undefined} onRetry={missing ? undefined : ()=>query.refetch()} retrying={query.isFetching}/>;
  }
  return <PageSkeletonLoader skeleton={skeleton} message={label} bodyOnly={bodyOnly} options={options}/>;
}
function BackLink({to,children='Back to Households'}) {
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
  const isDesktop=useMediaQuery(DESKTOP_QUERY);
  const canManage=access.can('families.manage');
  // Live search matches Health Commodities; short delay avoids a request per keystroke.
  useEffect(()=>{const timer=setTimeout(()=>setSearch(draft.trim()),300);return ()=>clearTimeout(timer);},[draft]);
  const noPurok=filters.purok === NO_PUROK_FILTER;
  const listKey=resetKeyOf(search,filters.purok,filters.barangay);
  const [paging,setPaging]=useState({key:listKey,page:1});
  // Reset while rendering so a filter/search change always returns to page 1.
  if(!Object.is(paging.key,listKey)) setPaging({key:listKey,page:1});
  const page=paging.page;
  const query=useQuery({
    queryKey:[...scope.key,'list',search,filters.purok,filters.barangay,page],
    queryFn:()=>getHouseholds({role,search,page,per_page:TABLE_PAGE_SIZE,barangay:filters.barangay,purok:noPurok ? '' : filters.purok,withoutPurok:noPurok}),
    retry:false,placeholderData:keepPreviousData,
  });
  const items=query.data?.items || [];
  const total=query.data?.meta.total || 0;
  const totalPages=Math.max(Number(query.data?.meta.last_page) || 1,1);
  const safePage=clampPage(page,totalPages);
  if(query.data && safePage !== page) setPaging({key:listKey,page:safePage});
  const options=query.data?.meta.filters || {puroks:[],barangays:[],hasWithoutPurok:false};
  const chips=[
    filters.purok && {key:'purok',label:noPurok ? 'No purok recorded' : `Purok: ${filters.purok}`},
    filters.barangay && {key:'barangay',label:`Barangay: ${filters.barangay}`},
  ].filter(Boolean);
  const narrowed=Boolean(search) || chips.length > 0;
  const emptyRegistry=!narrowed && total === 0;
  const hasFilterChoices=options.puroks.length > 0 || options.hasWithoutPurok || options.barangays.length > 1 || chips.length > 0;
  function clearAll() {setDraft('');setSearch('');setFilters(NO_FILTERS);}
  function changePage(next) {setPaging({key:listKey,page:clampPage(next,totalPages)});}
  const addPath=`${base}/new`;
  if(accessDenied(query.error)) return <DashboardLayout role={role} title="Households"><QueryState query={query}/></DashboardLayout>;
  if(query.isPending && !query.data) return <DashboardLayout role={role} title="Households"><QueryState query={query} options={{role,canManage,action:canManage,minWidth:720,mobileCards:false,rowHeight:56,headHeight:44}}/></DashboardLayout>;
  if(!query.data && query.error) return <DashboardLayout role={role} title="Households"><QueryState query={query}/></DashboardLayout>;
  // Same scroll model as Follow-ups: one page scroller, no pinned toolbar / nested results pane.
  return <DashboardLayout role={role} title="Households">
    <div className="w-full min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 shrink">
          <h1 className="text-[17px] font-bold tracking-tight text-ink-800">Households</h1>
          <p className="mt-1 text-[13px] text-neutral-600">
            Households registered in your {facilityLabel(role)}.
          </p>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
          <SearchFilterCluster
            className="max-w-full"
            search={
              <SearchField
                value={draft}
                onChange={setDraft}
                placeholder="Search FSN, household head or address"
                label="Search families"
              />
            }
            filter={hasFilterChoices ? <FamilyDirectoryFilter applied={filters} options={options} onApply={setFilters}/> : null}
          />
          {isDesktop && canManage ? (
            <Button asChild variant="brand" size="sm" className="shrink-0">
              <Link to={addPath}>
                <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
                Add Family
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {!query.isPending && (chips.length > 0 || query.isFetching) && (
        <div className="flex min-h-7 flex-wrap items-center gap-2">
          {chips.map(chip=><span key={chip.key} className="inline-flex h-7 items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 pl-3 pr-1 text-xs text-ink-800">{chip.label}<button type="button" aria-label={`Remove filter ${chip.label}`} onClick={()=>setFilters(previous=>({...previous,[chip.key]:''}))} className="flex h-5 w-5 items-center justify-center rounded-full text-neutral-500 outline-none hover:bg-neutral-200 hover:text-ink-800 focus-visible:ring-2 focus-visible:ring-ink-400/50"><X size={12} aria-hidden="true"/></button></span>)}
          {narrowed && items.length > 0 && <Button type="button" variant="ghost" size="compact" onClick={clearAll}>Clear all</Button>}
          {query.isFetching && <RefreshingIndicator label="Updating…"/>}
        </div>
      )}

      {query.error && query.data ? <p role="status" className="text-sm text-neutral-600">Unable to refresh households. Showing the last list that loaded.</p> : null}
      {!query.isPending && !query.error && <p role="status" className="sr-only">{total} {total === 1 ? 'household' : 'households'}{narrowed ? ' found' : ''}</p>}

      {items.length ? (
        <FamilyDirectoryTable
          items={items}
          base={base}
          dimmed={query.isPlaceholderData}
          footer={<TablePagination currentPage={safePage} totalPages={totalPages} onPageChange={changePage} alwaysShow disabled={query.isFetching}/>}
        />
      ) : (
        <div className={`${SHEET} flex flex-col items-center justify-center gap-2 px-6 text-center`} style={{height:tableBodyHeight()}}>
          <h2 className="text-sm font-semibold text-ink-800">{emptyRegistry ? 'No families registered yet' : 'No households found'}</h2>
          <p className="max-w-sm text-[13px] text-neutral-500">{emptyRegistry ? 'Register a patient to start the first household, or use Add Family for a patient who is already registered.' : 'Try a different search, or clear the search and filters.'}</p>
          {narrowed && <Button variant="secondary" size="sm" className="mt-2" onClick={clearAll}>Clear search and filters</Button>}
        </div>
      )}

      {!isDesktop && canManage && (
        <Link
          to={addPath}
          aria-label="Add Family"
          className="fixed bottom-5 right-5 z-20 flex size-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg md:hidden"
        >
          <Plus size={24} strokeWidth={2.25} aria-hidden="true" />
        </Link>
      )}
    </div>
  </DashboardLayout>;
}
export function BhcFamilyDetails({role='bhc'}={}) {
  const {householdId}=useParams();
  const [params,setParams]=useSearchParams();
  const scope=useHouseholdScope(role);
  const access=useAccess();
  const navigate=useNavigate();
  const base=familyBase(role);
  const [view,setView]=useState('tree');
  const [transferring,setTransferring]=useState(null);
  const [addingMember,setAddingMember]=useState(false);
  const canRegister=access.can('patients.register');
  const query=useQuery({queryKey:[...scope.key,'detail',householdId],queryFn:()=>getHouseholdById(householdId, role),retry:false});
  const item=query.data;
  const members=useMemo(()=>[...(item?.members || [])].sort((a,b)=>Number(b.id === item?.headPatientId)-Number(a.id === item?.headPatientId)),[item]);
  const head=item?.members.find(member=>member.id === item.headPatientId);
  const tabs=[['tree','Household Relationships'],['list','Members List']];
  const openMember=id=>navigate(`/${role}/patients/${id}?tab=patient-info`);
  useEffect(()=>{
    if(!item || item.archivedAt || !canRegister || params.get('addMember') !== '1') return;
    setAddingMember(true);
    const next=new URLSearchParams(params);
    next.delete('addMember');
    setParams(next,{replace:true});
  },[item,canRegister,params,setParams]);
  function moveTab(event) {
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const next=event.key === 'Home' ? 'tree' : event.key === 'End' ? 'list' : view === 'tree' ? 'list' : 'tree';
    setView(next);document.getElementById(`family-tab-${next}`)?.focus();
  }
  if(accessDenied(query.error) || (query.isPending && !item)) return <FamilyFrame role={role} title="Family Details"><QueryState query={query} label="Loading household…" skeleton="family-details" options={{view,canManage:access.can('families.manage'),canRegister}}/></FamilyFrame>;
  if(!item && query.error) return <FamilyFrame role={role} title="Family Details"><QueryState query={query} label="Loading household…" skeleton="family-details"/></FamilyFrame>;
  const viewTabs=<div role="tablist" aria-label="Family view" className="inline-flex gap-1 rounded-full border border-neutral-200 bg-neutral-100 p-1">{tabs.map(([key,label])=><button key={key} type="button" role="tab" id={`family-tab-${key}`} aria-selected={view === key} aria-controls={`family-panel-${key}`} tabIndex={view === key ? 0 : -1} onClick={()=>setView(key)} onKeyDown={moveTab} className={`h-7 rounded-full px-4 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink-400/50 ${view === key ? 'bg-ink-700 text-white' : 'text-neutral-600 hover:text-neutral-900'}`}>{label}</button>)}</div>;
  return <FamilyFrame role={role} title="Family Details"><BackLink to={base}/>{item.archivedAt ? <p role="status" className={`${SHEET} px-6 py-10 text-center text-sm text-neutral-600`}>This household is archived.</p> : <>
    {query.isFetching && <div className="flex justify-end"><RefreshingIndicator label="Updating household..."/></div>}
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2.5"><h1 className={TITLE}>{head ? `${head.lastName} Household` : 'Household'}</h1><span className="rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-0.5 font-mono text-xs text-neutral-600">{item.serialNumber}</span></div>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-neutral-600"><span className="inline-flex items-center gap-1.5"><User size={14} className="text-neutral-500" aria-hidden="true"/>Head: <b className="font-semibold text-ink-800">{head ? patientName(head) : 'Not assigned'}</b></span><span className="inline-flex min-w-0 items-center gap-1.5"><MapPin size={14} className="shrink-0 text-neutral-500" aria-hidden="true"/>{addressText(item.address) || 'No address recorded'}</span><span className="inline-flex items-center gap-1.5"><Users size={14} className="text-neutral-500" aria-hidden="true"/>{item.members.length} {item.members.length === 1 ? 'member' : 'members'}</span></p></div>
      <div className="flex flex-wrap gap-2">{access.can('families.manage') && <Button asChild variant="secondary"><Link to={`${base}/${item.id}/edit`}>Edit Family</Link></Button>}{canRegister && <Button type="button" variant="brand" onClick={()=>setAddingMember(true)}><Plus size={17}/>Add Existing Member</Button>}</div></header>
    <section id={`family-panel-${view}`} className="space-y-3" aria-label="Household members">{view === 'tree'
      ? <FamilyTreeCanvas leading={viewTabs} members={members} headId={item.headPatientId} onOpenMember={openMember}/>
      : <>{viewTabs}<FamilyMembersList members={members} headId={item.headPatientId} canTransfer={canRegister} onTransfer={setTransferring} patientPath={`/${role}/patients`}/></>}</section>
    {transferring && <TransferHouseholdModal role={role} member={transferring} household={item} onClose={()=>setTransferring(null)}/>}
    {addingMember && <AddExistingMemberModal role={role} household={item} onClose={()=>setAddingMember(false)}/>}
  </>}</FamilyFrame>;
}
function Field({name,label,error,children}) {
  return <div className="space-y-1.5"><label htmlFor={name} className="block text-sm font-medium">{label}</label>{children}{error && <p id={`${name}-error`} role="alert" className="text-xs text-red-700">{Array.isArray(error) ? error[0] : error}</p>}</div>;
}
export function BhcFamilyForm({role='bhc'}={}) {
  const {householdId}=useParams();
  const scope=useHouseholdScope(role);
  const query=useQuery({queryKey:[...scope.key,'detail',householdId],queryFn:()=>getHouseholdById(householdId, role),enabled:Boolean(householdId),retry:false});
  if(accessDenied(query.error)) return <FamilyFrame role={role} title="Edit Family"><QueryState query={query}/></FamilyFrame>;
  if(householdId && !query.data && (query.isPending || query.error)) return <FamilyFrame role={role} title="Edit Family"><QueryState query={query} label="Loading household…" skeleton="family-form"/></FamilyFrame>;
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
    <form className="w-full min-w-0 max-w-7xl space-y-5" noValidate onSubmit={event=>{event.preventDefault();if(!mutation.isPending) {setErrors({});mutation.mutate();}}}>
      {refreshError && <div className="space-y-2 text-sm text-red-700"><p role="status">Saved family data could not refresh. Your draft is kept.</p><Button type="button" variant="secondary" size="sm" onClick={onRefresh}>Retry refresh</Button></div>}
      {!item && <section className={`${SHEET} space-y-3 p-5`}><h2 className={HEADING}>Household head</h2><label htmlFor="head-search" className="block text-sm font-medium">Search registered patients</label><div className="flex gap-2"><Input id="head-search" type="search" placeholder="Search patient name" value={search} onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key === 'Enter'){event.preventDefault();if(submitted === search)candidates.refetch();else setSubmitted(search);}}}/><Button type="button" variant="secondary" className="h-11" onClick={()=>{setSubmitted(search);if(submitted === search)candidates.refetch();}}>Search</Button></div>{candidates.isFetching ? <p role="status" className="text-sm">Searching patients…</p> : candidates.error ? <p role="alert" className="text-sm text-red-700">Unable to search patients. Select Search to retry.</p> : submitted !== null && <div className="max-h-64 overflow-y-auto divide-y divide-neutral-200 border-y border-neutral-200">{candidates.data?.length ? candidates.data.map(patient=>{
        const eligibility=canHeadHousehold(patient);
        const isHead=String(patient.household?.head_patient_id || '') === patient.id;
        const blockedHead=isHead && Number(patient.household?.members_count || 0) > 1;
        return <button type="button" key={patient.id} disabled={!eligibility.ok || blockedHead} aria-pressed={draft.head_patient_id === patient.id} onClick={()=>{setChosenHead(patient);setDraft(previous=>({...previous,head_patient_id:patient.id,address:addressValues(patient)}));setErrors({});}} className={`block w-full px-3 py-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-400/50 disabled:opacity-50 ${draft.head_patient_id === patient.id ? 'bg-neutral-100 text-ink-800 ring-1 ring-inset ring-ink-400':'hover:bg-neutral-50'}`}><span className="font-medium">{patientName(patient)}</span><span className="mt-1 block text-xs">{!eligibility.ok ? eligibility.reason : blockedHead ? 'Assign a new head in Edit Family first.' : patient.familySerialNumber ? `Currently in ${patient.familySerialNumber}. This patient will move to the new household.` : 'No household assigned'}</span></button>;
      }) : <p className="py-5 text-sm text-neutral-500">No matching patients.</p>}</div>}{chosenHead && <p className="text-sm font-medium">Selected head: {patientName(chosenHead)}</p>}{errorFor('head_patient_id') && <p role="alert" className="text-xs text-red-700">{errorFor('head_patient_id')}</p>}</section>}
      <div className={`${SHEET} space-y-5 p-5`}><h2 className={HEADING}>Household details</h2><section className="space-y-3"><Field name="serial_number" label="Family Serial Number" error={errorFor('serial_number')}><Input {...inputProps('serial_number')} readOnly={!item && draft.serial_mode === 'auto'} value={!item && draft.serial_mode === 'auto' ? 'Assigned automatically on save' : draft.serial_number} maxLength={100} onChange={event=>change('serial_number',event.target.value)}/></Field>{!item && <><Button type="button" variant="secondary" size="sm" onClick={()=>setDraft(previous=>({...previous,serial_mode:previous.serial_mode === 'auto' ? 'manual':'auto',serial_number:''}))}>{draft.serial_mode === 'auto' ? 'Enter manually':'Use automatic FSN'}</Button><p className="text-xs text-neutral-500">Automatic format: FSN-YYYY-NNNN. Your {facilityLabel(role)} assigns the number when this family is saved.</p></>}{item && <p className="text-xs text-neutral-500">Correcting the FSN updates all linked members and keeps their household connection.</p>}</section>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{[['streetAddress','House / Street'],['purokArea','Purok / Area (optional)'],['barangay','Barangay'],['municipality','Municipality']].map(([key,label])=><Field key={key} name={`address.${key}`} label={label} error={errorFor(`address.${key}`)}><Input {...inputProps(`address.${key}`)} required={key !== 'purokArea'} value={draft.address[key]} onChange={event=>{change('address',{...draft.address,[key]:event.target.value});setErrors(previous=>({...previous,[`address.${key}`]:undefined}));}}/></Field>)}</div></div>
      {item && <section className={`${SHEET} space-y-4 p-5`}><h2 className={HEADING}>Household head</h2><Field name="head_patient_id" label="Current head" error={errorFor('head_patient_id')}><Select {...inputProps('head_patient_id')} value={draft.head_patient_id} onChange={event=>{change('head_patient_id',event.target.value);change('relationships',{});}}><option value="">Select head</option>{item.members.map(member=><option key={member.id} value={member.id}>{patientName(member)}</option>)}</Select></Field>{draft.head_patient_id !== item.headPatientId && item.members.filter(member=>member.id !== draft.head_patient_id).map(member=><Field key={member.id} name={`relationships.${member.id}`} label={`${patientName(member)} — relationship to new head`} error={errorFor(`relationships.${member.id}`)}><Select {...inputProps(`relationships.${member.id}`)} value={draft.relationships[member.id] || ''} onChange={event=>change('relationships',{...draft.relationships,[member.id]:event.target.value})}><option value="">Select relationship</option>{RELATIONSHIP_LABELS.map(value=><option key={value}>{value}</option>)}</Select></Field>)}</section>}
      {errors.form && <p role="alert" className="text-sm text-red-700">{errors.form}</p>}{conflict && <Button type="button" variant="secondary" onClick={()=>window.location.reload()}>Reload saved family and discard this draft</Button>}<div className="flex justify-end gap-3"><Button asChild variant="secondary"><Link to={item ? `${base}/${item.id}`:base}>Cancel</Link></Button><Button variant="brand" disabled={mutation.isPending || conflict} type="submit">{mutation.isPending ? 'Saving…':'Save Family'}</Button></div>
    </form>
    <NoticeModal open={blocker.state === 'blocked'} title="Leave without saving?" message="This family has unsaved changes. If you leave now, they will be lost." onClose={()=>{}} dismissOnBackdrop={false} actions={[{label:'Keep Editing',variant:'secondary',onClick:()=>blocker.reset?.()},{label:'Discard Changes',variant:'destructive',onClick:()=>blocker.proceed?.()}]}/>
  </FamilyFrame>;
}
export function BhcAddMember({role='bhc'}={}) {
  const {householdId}=useParams();
  return <Navigate replace to={`/${role}/families/${householdId}?addMember=1`}/>;
}
export function BhcDeferredFamilyAction({role='bhc'}={}) {
  const {householdId}=useParams();
  return <Navigate replace to={`${familyBase(role)}/${householdId}`}/>;
}
