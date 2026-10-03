import { conditionIdentity } from "./carePlan.js";

/**
 * The conditions the consultation's Patient Background summary shows, in two
 * groups that never contradict each other:
 *
 * - monitored ("Currently Monitored"): every documented condition the registry
 *   recognizes, every documented condition under active BHC monitoring, and
 *   every active monitoring with no documented entry - each once. A condition
 *   addressed in this visit (picked in Start Consultation) is flagged.
 * - other ("Other Conditions"): the remaining documented conditions.
 *
 * Reference only; nothing here is editable (Review / Update is the editor).
 */

function monitoringIdentity(monitoring, registry) {
  return monitoring?.conditionKey || conditionIdentity(monitoring?.conditionName, registry);
}

export function backgroundConditionGroups({ diseases = [], monitorings = [], followed = [], registry = {} } = {}) {
  const documented = (Array.isArray(diseases) ? diseases : []).filter(
    (disease) => disease && String(disease.name || "").trim(),
  );
  const addressed = new Set(followed.map((monitoring) => monitoringIdentity(monitoring, registry)));
  const activeByIdentity = new Map();
  for (const monitoring of [...followed, ...monitorings]) {
    const identity = monitoringIdentity(monitoring, registry);
    if (!activeByIdentity.has(identity)) activeByIdentity.set(identity, monitoring);
  }
  const knownKeys = registry?.monitored_conditions || {};

  const monitored = [];
  const other = [];
  const listed = new Set();
  for (const disease of documented) {
    const identity = conditionIdentity(disease.name, registry);
    const entry = {
      key: identity,
      name: String(disease.name).trim(),
      status: disease.status || "",
      addressed: addressed.has(identity),
    };
    if ((disease.conditionKey && knownKeys[disease.conditionKey]) || activeByIdentity.has(identity)) {
      if (listed.has(identity)) continue;
      listed.add(identity);
      monitored.push(entry);
    } else {
      other.push(entry);
    }
  }
  // An active monitoring with no documented entry (a free-text condition the
  // background never recorded) is still being monitored.
  for (const [identity, monitoring] of activeByIdentity) {
    if (listed.has(identity)) continue;
    listed.add(identity);
    monitored.push({ key: identity, name: monitoring.conditionName, status: "", addressed: addressed.has(identity) });
  }
  return { monitored, other };
}
