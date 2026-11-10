export function registrationTarget(to, role) {
  if (typeof to !== "string" || !["bhc", "rhu"].includes(role) || !to.startsWith(`/`)) return null;
  const url = new URL(to, "https://akay.local");
  return url.origin === "https://akay.local" && url.pathname === `/${role}/patients/add` ? `${url.pathname}${url.search}${url.hash}` : null;
}

export function isWalkInRegistrationRecovery(to, role) {
  const target = registrationTarget(to, role);
  return role === "rhu" && Boolean(target) && new URL(target, "https://akay.local").searchParams.get("check_in") === "1";
}

const key = (owner, path) => ["registration-entry", owner, path];
export function storeRegistrationEntry(client, owner, path, engine, now = Date.now()) {
  engine.clearTimers();
  client.setQueryData(key(owner, path), { engine, at: now, consumed: false });
}
export function readRegistrationEntry(client, owner, path, now = Date.now()) {
  const entry = client.getQueryData(key(owner, path));
  const engine = entry?.engine;
  return entry && now - entry.at >= 0 && now - entry.at < 60000 && !engine.closed && engine.options.owner === owner &&
    engine.identity.form_type === "patient" && engine.identity.mode === "create" && engine.identity.context_key === "new" && engine.getSnapshot().ready ? engine : null;
}
export function consumeRegistrationEntry(client, owner, path, engine, now = Date.now()) {
  if (readRegistrationEntry(client, owner, path, now) !== engine) return false;
  const entry = client.getQueryData(key(owner, path));
  if (!entry || entry.engine !== engine) return false;
  // Keep the ready engine readable across StrictMode remount; do not re-init.
  if (entry.consumed) return true;
  client.setQueryData(key(owner, path), { ...entry, consumed: true });
  return true;
}
export function releaseRegistrationEntry(client, owner, path, engine) {
  const entry = client.getQueryData(key(owner, path));
  if (entry?.engine !== engine) return false;
  client.removeQueries({ queryKey: key(owner, path), exact: true });
  // Consumed handoffs belong to the open form — clear the bookmark only.
  return !entry.consumed;
}
