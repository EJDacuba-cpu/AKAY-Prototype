const CANONICAL_ROLES = ["admin", "bhc", "rhu"];
const CANONICAL_STATUSES = ["active", "inactive"];

const ROLE_LABELS = {
  all: "All Roles",
  admin: "Admin",
  bhc: "BHC",
  rhu: "RHU",
};

const STATUS_LABELS = {
  all: "All Statuses",
  active: "Active",
  inactive: "Inactive",
};

const INCOMPLETE = "Account analytics matrix is incomplete.";
const BAD_COUNT = "Account analytics contains a negative or non-integer count.";
const RECONCILE = "Account analytics totals do not reconcile.";
const UNAVAILABLE = "Access summary unavailable";
const SCOPE_LABEL = "System-wide (unfiltered)";

export const DEFAULT_ACCOUNT_FILTERS = Object.freeze({ role: "all", status: "all" });

export const ROLE_OPTIONS = Object.freeze([
  { value: "all", label: ROLE_LABELS.all },
  { value: "admin", label: ROLE_LABELS.admin },
  { value: "bhc", label: ROLE_LABELS.bhc },
  { value: "rhu", label: ROLE_LABELS.rhu },
]);

export const STATUS_OPTIONS = Object.freeze([
  { value: "all", label: STATUS_LABELS.all },
  { value: "active", label: STATUS_LABELS.active },
  { value: "inactive", label: STATUS_LABELS.inactive },
]);

function fail(error) {
  return { ok: false, error };
}

function isNonnegativeInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function sameList(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((item, index) => item === expected[index]);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readCount(container, key) {
  if (!isPlainObject(container) || !Object.hasOwn(container, key)) return { ok: false, error: INCOMPLETE };
  if (!isNonnegativeInteger(container[key])) return { ok: false, error: BAD_COUNT };
  return { ok: true, value: container[key] };
}

function exactKeys(container, keys) {
  if (!isPlainObject(container)) return false;
  const actual = Object.keys(container);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(container, key));
}

export function parseAccountAnalytics(raw) {
  if (!isPlainObject(raw) || !sameList(raw.roles, CANONICAL_ROLES) || !sameList(raw.statuses, CANONICAL_STATUSES)) {
    return fail("Account analytics is missing or malformed.");
  }
  if (!exactKeys(raw.matrix, CANONICAL_ROLES)) return fail(INCOMPLETE);

  const matrix = {};
  for (const role of CANONICAL_ROLES) {
    if (!exactKeys(raw.matrix[role], CANONICAL_STATUSES)) return fail(INCOMPLETE);
    matrix[role] = {};
    for (const status of CANONICAL_STATUSES) {
      const cell = readCount(raw.matrix[role], status);
      if (!cell.ok) return cell;
      matrix[role][status] = cell.value;
    }
  }

  const totals = raw.totals;
  if (!isPlainObject(totals) || !exactKeys(totals.by_role, CANONICAL_ROLES)) return fail(INCOMPLETE);

  const counts = {};
  for (const key of ["accounts", "canonical_accounts", "active", "inactive"]) {
    const count = readCount(totals, key);
    if (!count.ok) return count;
    counts[key] = count.value;
  }
  const other = readCount(raw, "other_accounts");
  if (!other.ok) return other;

  const byRole = {};
  for (const role of CANONICAL_ROLES) {
    const count = readCount(totals.by_role, role);
    if (!count.ok) return count;
    byRole[role] = count.value;
  }

  const active = CANONICAL_ROLES.reduce((sum, role) => sum + matrix[role].active, 0);
  const inactive = CANONICAL_ROLES.reduce((sum, role) => sum + matrix[role].inactive, 0);
  const matrixTotal = active + inactive;
  const reconciled = counts.canonical_accounts === counts.active + counts.inactive
    && counts.accounts === counts.canonical_accounts + other.value
    && counts.accounts === matrixTotal + other.value
    && counts.active === active
    && counts.inactive === inactive
    && CANONICAL_ROLES.every((role) => byRole[role] === matrix[role].active + matrix[role].inactive);

  if (!reconciled) return fail(RECONCILE);

  return {
    ok: true,
    analytics: {
      roles: [...CANONICAL_ROLES],
      statuses: [...CANONICAL_STATUSES],
      matrix,
      totals: { ...counts, by_role: byRole },
      other_accounts: other.value,
    },
  };
}

function resolveFilters(filters) {
  if (filters == null) return { ...DEFAULT_ACCOUNT_FILTERS };
  if (!isPlainObject(filters)) return null;
  const role = filters.role ?? DEFAULT_ACCOUNT_FILTERS.role;
  const status = filters.status ?? DEFAULT_ACCOUNT_FILTERS.status;
  if (!Object.hasOwn(ROLE_LABELS, role) || !Object.hasOwn(STATUS_LABELS, status)) return null;
  return { role, status };
}

function roleChartTitle(filters) {
  if (filters.role === "all" && filters.status === "all") return "Accounts by Recognized Roles";
  if (filters.status === "all") return `${ROLE_LABELS[filters.role]} Accounts`;
  if (filters.role === "all") return `${STATUS_LABELS[filters.status]} Accounts by Recognized Roles`;
  return `${STATUS_LABELS[filters.status]} ${ROLE_LABELS[filters.role]} Accounts`;
}

function readSummaryCount(summary, keys) {
  const present = keys.filter((key) => Object.hasOwn(summary, key) && summary[key] !== undefined);
  if (present.length === 0) return undefined;
  const value = summary[present[0]];
  if (present.some((key) => summary[key] !== value) || !isNonnegativeInteger(value)) return undefined;
  return value;
}

function accessRequestsFrom(accessSummary, accessSummaryError) {
  if (accessSummaryError) {
    const reason = accessSummaryError instanceof Error
      ? accessSummaryError.message
      : typeof accessSummaryError === "string"
        ? accessSummaryError
        : "";
    return { available: false, reason: reason.trim() || UNAVAILABLE };
  }
  if (!isPlainObject(accessSummary)) return { available: false, reason: UNAVAILABLE };

  const pendingInvitations = readSummaryCount(accessSummary, ["invites", "pendingInvitations"]);
  const pendingPasswordResets = readSummaryCount(accessSummary, ["resetRequests", "reset_requests", "pendingPasswordResets"]);
  if (pendingInvitations === undefined || pendingPasswordResets === undefined) {
    return { available: false, reason: UNAVAILABLE };
  }

  return {
    available: true,
    pendingInvitations,
    pendingPasswordResets,
    scopeLabel: SCOPE_LABEL,
  };
}

export function buildAdminAccountReport({ analytics, accessSummary, accessSummaryError, filters } = {}) {
  const parsed = parseAccountAnalytics(analytics);
  if (!parsed.ok) return parsed;

  const resolved = resolveFilters(filters);
  if (!resolved) return fail("Account filters are not recognized.");

  const source = parsed.analytics;
  const roles = resolved.role === "all" ? CANONICAL_ROLES : [resolved.role];
  const summaryRows = roles.map((role) => {
    const active = resolved.status === "inactive" ? 0 : source.matrix[role].active;
    const inactive = resolved.status === "active" ? 0 : source.matrix[role].inactive;
    return {
      role,
      label: ROLE_LABELS[role],
      total: active + inactive,
      active,
      inactive,
    };
  });
  const summaryTotals = summaryRows.reduce(
    (totals, row) => ({
      total: totals.total + row.total,
      active: totals.active + row.active,
      inactive: totals.inactive + row.inactive,
    }),
    { total: 0, active: 0, inactive: 0 },
  );
  const recognizedTotal = source.totals.canonical_accounts;

  return {
    ok: true,
    filters: resolved,
    filterLabel: `${ROLE_LABELS[resolved.role]} · ${STATUS_LABELS[resolved.status]}`,
    roleChartTitle: roleChartTitle(resolved),
    databaseTotal: source.totals.accounts,
    recognizedTotal,
    otherAccounts: source.other_accounts,
    showOtherWarning: source.other_accounts > 0,
    filteredRegisteredTotal: summaryTotals.total,
    roleDistribution: summaryRows.map(({ role, label, total }) => ({ role, label, total })),
    statusByRole: summaryRows.map(({ role, label, active, inactive }) => ({ role, label, active, inactive })),
    statusTotals: { active: summaryTotals.active, inactive: summaryTotals.inactive },
    summaryRows,
    summaryTotals,
    emptyKind: recognizedTotal === 0 ? "no-accounts" : summaryTotals.total === 0 ? "no-matches" : "none",
    accessRequests: accessRequestsFrom(accessSummary, accessSummaryError),
  };
}
