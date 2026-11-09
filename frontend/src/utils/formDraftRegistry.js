import registry from "../config/formDraftSchemas.json" with { type: "json" };
const invalid = (message) => Object.assign(new Error(message), { code: "DRAFT_SNAPSHOT_INVALID" });

export { formDraftOwnerContext } from "./formDraftRequest.js";

export function assertFormDraftPayload(formType, payload) {
  const schema = registry.forms[formType]?.schema;
  if (!schema) throw invalid("This form is not registered for draft recovery.");
  function visit(value, node, path) {
    if (node === true) {
      if (value !== null && typeof value === "object") throw invalid(`Unsupported draft value at ${path}.`);
      return value;
    }
    if (!value || typeof value !== "object") throw invalid(`Unsupported draft value at ${path}.`);
    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
      const allowed = Object.hasOwn(node, key) ? node[key] : /^\d+$/.test(key) ? node["*"] : undefined;
      if (!allowed) throw invalid(`The draft adapter contains an unregistered field: ${path}.${key}.`);
      return [key, Array.isArray(child) ? visitArray(child, allowed, `${path}.${key}`) : visit(child, allowed, `${path}.${key}`)];
    }));
  }
  function visitArray(value, node, path) {
    return value.map((child, index) => {
      const allowed = node[index] || node["*"];
      if (!allowed) throw invalid(`The draft adapter contains an unregistered field: ${path}.${index}.`);
      return Array.isArray(child) ? visitArray(child, allowed, path) : visit(child, allowed, path);
    });
  }
  return visit(payload, schema, "payload");
}

export { registry as formDraftRegistry };
