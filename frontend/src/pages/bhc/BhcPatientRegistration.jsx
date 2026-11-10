import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { ConnectionErrorState } from '../../components/common';
import { PatientRegistrationSkeleton } from '../../components/common/loading/SkeletonLoaders';
import { RegistrationForm } from './AddPatient';
import useHouseholdScope from '../../hooks/useBhcHouseholdScope';
import { getHouseholdById, getHouseholds } from '../../services/householdService';
import { createPatient, updatePatient, getPatientById } from '../../services/patientService';
import { householdPayload, householdRegistry, normalizeHousehold, normalizeHouseholdPatient } from '../../utils/householdData';
import { errorStateVariant } from '../../utils/errorStateVariant';
import { queryKeys } from '../../utils/queryKeys';
import { isCheckInFlow, newWalkIn, withDuplicateConfirm } from '../../utils/walkInRegistration';

export default function BhcPatientRegistration({ role = 'bhc', ...props }) {
  const scope=useHouseholdScope(role);
  return <RegistrationSource key={`${scope.identity}:${props.patientId || 'new'}`} {...props} scope={scope} role={role} />;
}
function RegistrationSource({patientId,scope,role='bhc',...props}) {
  const client=useQueryClient();
  const [params]=useSearchParams();
  const initialHouseholdId=params.get('household');
  // Walk-in flow: one key per registration page, so a re-sent save is recognised by the server.
  const [walkIn,setWalkIn]=useState(() => role === 'rhu' && !patientId && isCheckInFlow(params.toString()) ? newWalkIn() : null);
  const [recoveryHouseholdId, setRecoveryHouseholdId] = useState(undefined);
  const [known,setKnown]=useState([]);
  const [results,setResults]=useState([]);
  const [searchState,setSearchState]=useState({loading:false,error:''});
  const request=useRef(0);
  const patient=useQuery({queryKey:[...scope.key,'registration',patientId],queryFn:()=>getPatientById(patientId),enabled:Boolean(patientId),retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false});
  const saved=patient.data ? normalizeHouseholdPatient(patient.data) : undefined;
  const selectedId=saved?.householdId || (recoveryHouseholdId !== undefined ? recoveryHouseholdId : initialHouseholdId);
  const selected=useQuery({queryKey:[...scope.key,'detail',selectedId],queryFn:()=>getHouseholdById(selectedId, role),enabled:Boolean(selectedId),retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false});
  const registry=householdRegistry([...known,selected.data],saved);
  const mutation=useMutation({mutationFn:({id,data,requestOptions})=>id ? updatePatient(id,data):createPatient(data,requestOptions)});
  async function search(value) {
    const seq=++request.current;
    setSearchState({loading:true,error:''}); setResults([]);
    try {
      const page=await client.fetchQuery({queryKey:[...scope.key,'lookup',value],queryFn:()=>getHouseholds({role,lookup:true,search:value,per_page:100}),staleTime:0});
      if(seq !== request.current) return;
      setResults(page.items);
      setKnown(previous=>householdRegistry([...previous,...page.items]).households);
      setSearchState({loading:false,error:''});
    } catch(error) {if(seq === request.current) setSearchState({loading:false,error:error.message || 'Unable to search households.'});}
  }
  async function save(data,connection,id,replacement,options={}) {
    const base={...data,household:householdPayload(connection,registry),
      ...(replacement ? {head_replacement:{household_id:replacement.householdId,head_patient_id:replacement.headPatientId,relationships:replacement.relationships,version:registry.households.find(item=>item.id === replacement.householdId)?.version}} : {})};
    const payload=role === 'rhu' && !id ? withDuplicateConfirm(base, options.confirmDuplicate) : base;
    // A recovered household revision must not silently advance after refetch.
    if (connection?.kind === 'existing' && Number.isInteger(options.householdVersion)) {
      payload.household.version = options.householdVersion;
      if (payload.head_replacement) payload.head_replacement.version = options.householdVersion;
    }
    const response=normalizeHouseholdPatient(await mutation.mutateAsync({id,data:payload,requestOptions:options.draftOptions}));
    if(response.household) {
      // Use the committed response: a failed follow-up read must not turn a save into an error.
      setKnown(previous=>{
        const existing=previous.find(item=>item.id === response.householdId);
        const household=normalizeHousehold({...response.household,members:[...(existing?.members || []).filter(member=>member.id !== response.id),response]});
        return householdRegistry([...previous.filter(item=>item.id !== household.id),household]).households;
      });
    }
    await Promise.all([client.invalidateQueries({queryKey:scope.key}),client.invalidateQueries({queryKey:queryKeys.patients(role)}),client.invalidateQueries({queryKey:['patient-details',role]}),client.invalidateQueries({queryKey:queryKeys.dashboardSummary('bhc')})]);
    return response;
  }
  const waiting=(patientId && patient.isPending) || (selectedId && selected.isPending && recoveryHouseholdId === undefined);
  const error=(!patient.data && patient.error) || (!selected.data && selected.error && recoveryHouseholdId === undefined);
  if(error) return <DashboardLayout role={role} title="Patient Registration" contentClassName="patient-registration"><ConnectionErrorState fullPage variant={errorStateVariant(error)} onRetry={()=>{patient.refetch();selected.refetch();}} retrying={patient.isFetching || selected.isFetching} /></DashboardLayout>;
  if(waiting) return <DashboardLayout role={role} title="Patient Registration" contentClassName="patient-registration"><PatientRegistrationSkeleton message="Loading registration details..." /></DashboardLayout>;
  return <RegistrationForm {...props} role={role} patientId={patientId} registry={registry} savedPatientOverride={saved} savePatient={save} walkIn={walkIn} live
    onRecoveryHouseholdChange={setRecoveryHouseholdId} onRecoveryWalkIn={setWalkIn}
    householdRecoveryLoading={Boolean(recoveryHouseholdId && selected.isPending)}
    householdRecoveryError={recoveryHouseholdId && selected.error ? selected.error.message : ''}
    initialConnection={!patientId && selected.data ? {kind:'existing',householdId:selected.data.id,relationship:''} : undefined}
    onSearch={search} searchResults={results} searchLoading={searchState.loading} searchError={searchState.error}
    refreshError={Boolean(patient.error || selected.error)} onRefresh={()=>{if(patientId)patient.refetch();if(selectedId)selected.refetch();}} />;
}
