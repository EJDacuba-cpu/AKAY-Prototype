export function getItem(key, fallback = null) {
  const rawValue = localStorage.getItem(key);

  if (rawValue === null) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    // Backward-compatible for legacy plain-string values in storage.
    return rawValue;
  }
}

export function setItem(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  return value;
}

export function removeItem(key) {
  localStorage.removeItem(key);
}
