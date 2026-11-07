export function registrationTarget(to, role) {
  if (typeof to !== "string" || !["bhc", "rhu"].includes(role) || !to.startsWith(`/`)) return null;
  const url = new URL(to, "https://akay.local");
  return url.origin === "https://akay.local" && url.pathname === `/${role}/patients/add` ? `${url.pathname}${url.search}${url.hash}` : null;
}

const key = (owner, path) => ["registration-entry", owner, path];
export function storeRegistrationEntry(client, owner, path, engine, now = Date.now()) {
  engine.clearTimers();
  client.setQueryData(key(owner, path), { engine, at: now });
}
export function readRegistrationEntry(client, owner, path, now = Date.now()) {
  const entry = client.getQueryData(key(owner, path));
  const engine = entry?.engine;
  return entry && now - entry.at >= 0 && now - entry.at < 60000 && !engine.closed && engine.options.owner === owner &&
    engine.identity.form_type === "patient" && engine.identity.mode === "create" && engine.identity.context_key === "new" && engine.getSnapshot().ready ? engine : null;
}
export function consumeRegistrationEntry(client, owner, path, engine, now = Date.now()) {
  if (readRegistrationEntry(client, owner, path, now) !== engine) return false;
  return releaseRegistrationEntry(client, owner, path, engine);
}
export function releaseRegistrationEntry(client, owner, path, engine) {
  if (client.getQueryData(key(owner, path))?.engine !== engine) return false;
  client.removeQueries({ queryKey: key(owner, path), exact: true });
  return true;
}
