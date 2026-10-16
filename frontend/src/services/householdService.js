import { apiRequest, unwrapData } from './apiClient';
import { normalizeHousehold, normalizeHouseholdPatient } from '../utils/householdData';

export async function getHouseholds({lookup=false,search='',page=1,per_page=20} = {}) {
  const params=new URLSearchParams({search,page:String(page),per_page:String(per_page)});
  const response=await apiRequest(`/bhc/households${lookup ? '/lookup' : ''}?${params}`);
  const data=unwrapData(response);
  return {items:(Array.isArray(data) ? data : data?.data || []).map(normalizeHousehold),meta:response.meta || {current_page:data?.current_page || 1,last_page:data?.last_page || 1,total:data?.total || 0}};
}
export async function getHouseholdById(id) {
  return normalizeHousehold(unwrapData(await apiRequest(`/bhc/households/${id}`)));
}
export async function saveHousehold(data,id) {
  return normalizeHousehold(unwrapData(await apiRequest(`/bhc/households${id ? `/${id}` : ''}`,{method:id ? 'PATCH':'POST',body:data})));
}
export async function getHouseholdCandidates(search='') {
  const response=await apiRequest(`/bhc/households/candidates?${new URLSearchParams({search,per_page:'25'})}`);
  const data=unwrapData(response);
  return (Array.isArray(data) ? data : data?.data || []).map(normalizeHouseholdPatient);
}
export async function addRelationship(householdId,{version,patientId,relativeId,type}) {
  return normalizeHousehold(unwrapData(await apiRequest(`/bhc/households/${householdId}/relationships`,{method:'POST',body:{version,patient_id:patientId,relative_id:relativeId,type}})));
}
export async function changeRelationship(householdId,relationshipId,{version,type}) {
  return normalizeHousehold(unwrapData(await apiRequest(`/bhc/households/${householdId}/relationships/${relationshipId}`,{method:'PATCH',body:{version,type}})));
}
export async function removeRelationship(householdId,relationshipId,{version}) {
  return normalizeHousehold(unwrapData(await apiRequest(`/bhc/households/${householdId}/relationships/${relationshipId}`,{method:'DELETE',body:{version}})));
}
// Household-only command: PATCH /patients/{id} with just the household (and head replacement). No demographics are sent.
export async function changePatientHousehold(patientId,command) {
  return normalizeHouseholdPatient(unwrapData(await apiRequest(`/patients/${patientId}`,{method:'PATCH',body:command})));
}
