import { useEffect, useState } from 'react';
import { getFacilityCalendarDate } from '../utils/medicineInventoryStatus';

// Eligibility changes at Manila midnight even when no inventory write occurs.
export default function useFacilityCalendarDate() {
  const [day, setDay] = useState(getFacilityCalendarDate);
  useEffect(() => {
    const nextMidnight = Date.parse(`${day}T00:00:00+08:00`) + 86_400_000;
    const timer = setTimeout(() => setDay(getFacilityCalendarDate()), Math.max(1, nextMidnight - Date.now() + 50));
    const refresh = () => setDay(getFacilityCalendarDate());
    window.addEventListener('focus', refresh);
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); };
  }, [day]);
  return day;
}
