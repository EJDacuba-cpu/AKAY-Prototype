import { useSyncExternalStore } from 'react';
import { getCurrentUser } from '../utils/auth';
import { householdKeys } from '../utils/householdData';

const subscribe = callback => {
  window.addEventListener('akay:auth-changed',callback);
  window.addEventListener('akay:facility-changed',callback);
  return () => {window.removeEventListener('akay:auth-changed',callback);window.removeEventListener('akay:facility-changed',callback);};
};
export default function useHouseholdScope(role = 'bhc') {
  const snapshot = () => JSON.stringify([...householdKeys(getCurrentUser() || {}, role), role]);
  const identity=useSyncExternalStore(subscribe,snapshot,snapshot);
  return { user:getCurrentUser(), key:JSON.parse(identity).slice(0,-1), identity, role };
}
export function useBhcHouseholdScope() {
  return useHouseholdScope('bhc');
}
