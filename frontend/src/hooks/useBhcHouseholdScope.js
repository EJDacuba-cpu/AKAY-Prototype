import { useSyncExternalStore } from 'react';
import { getCurrentUser } from '../utils/auth';
import { householdKeys } from '../utils/householdData';

const subscribe = callback => {
  window.addEventListener('akay:auth-changed',callback);
  window.addEventListener('akay:facility-changed',callback);
  return () => {window.removeEventListener('akay:auth-changed',callback);window.removeEventListener('akay:facility-changed',callback);};
};
const snapshot = () => JSON.stringify(householdKeys(getCurrentUser() || {}));
export default function useBhcHouseholdScope() {
  const identity=useSyncExternalStore(subscribe,snapshot,snapshot);
  return { user:getCurrentUser(), key:JSON.parse(identity), identity };
}
