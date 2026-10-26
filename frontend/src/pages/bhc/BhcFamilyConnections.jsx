import { Navigate, useParams } from 'react-router';

// Preserve old bookmarks without exposing retired relationship-editing controls.
// The destination retains its existing household permissions and facility-scoped query.
export default function BhcFamilyConnections({ role = 'bhc' } = {}) {
  const { householdId } = useParams();
  return <Navigate replace to={`/${role}/families/${householdId}`} />;
}
