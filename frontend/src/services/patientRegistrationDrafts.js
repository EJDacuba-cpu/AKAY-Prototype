import { MockRegistryError, stageConnection, validateConnection, validateHeadReplacement } from "./mockFamilyRegistry.js";

// A route handoff, not a saved patient. No patient details enter browser
// history, URLs or persistent storage. Explicit Save/Cancel clears the draft.
export function createRegistrationDraftStore() {
  const drafts = new Map();
  return {
    read(key) {
      return drafts.has(key) ? structuredClone(drafts.get(key)) : null;
    },
    write(key, draft) {
      drafts.set(key, structuredClone(draft));
    },
    discard(key) {
      drafts.delete(key);
    },
    clear() {
      drafts.clear();
    },
    stageHousehold(key, registry, connection, replacement = null) {
      const draft = drafts.get(key);
      if (!draft) throw new MockRegistryError({ household: "Return to Patient Registration to start a new draft." });
      const errors = {
        ...validateConnection(registry, connection, draft.patientId),
        ...validateHeadReplacement(registry, draft.patientId, connection, replacement),
      };
      if (Object.keys(errors).length) throw new MockRegistryError(errors);
      drafts.set(key, structuredClone({
        ...draft,
        form: stageConnection(draft.form, registry, connection),
        householdConnection: connection,
        headReplacement: replacement,
        fieldErrors: {},
      }));
    },
  };
}

export const registrationDrafts = createRegistrationDraftStore();

export function registrationPath(basePath, patientId) {
  return `${basePath}/patients/${patientId || "add"}`;
}
