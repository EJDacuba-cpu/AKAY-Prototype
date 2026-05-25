import { getItem, setItem } from "./storageService";

const STORAGE_KEY = "akay_rhu_patient_volume";
const UPDATED_KEY = "akay_rhu_patient_volume_updated";

export function getRhuPatientVolume(defaultVolume = "Normal") {
  return getItem(STORAGE_KEY, defaultVolume);
}

export function getRhuPatientVolumeUpdatedTime(defaultValue = "Not updated yet") {
  return getItem(UPDATED_KEY, defaultValue);
}

export function saveRhuPatientVolume(volume, updatedTime) {
  setItem(STORAGE_KEY, volume);
  setItem(UPDATED_KEY, updatedTime);
}
