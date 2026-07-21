# AKAY Phase 4B Server-Side Cache

## Current configuration

- AKAY runs Laravel 13.8.0.
- The current local environment selects the `file` cache store.
- `config/cache.php` has a `database` fallback when `CACHE_STORE` is absent,
  while `.env.example` explicitly selects `file`.
- The existing `cache` and `cache_locks` migration is sufficient. Phase 4B
  creates no migration.
- Redis connections are defined, but the local PHP Redis extension is not
  available and Redis has not been selected or provisioned.
- The documented production topology is undecided. A file cache is suitable
  only for the current single-instance/local setup or processes sharing one
  reliable filesystem. Every application instance must use one shared cache
  backend before a multi-instance deployment can claim coherent invalidation
  or distributed locking.

## Eligibility matrix

| Domain | Eligible | Phase 4B | TTL | Reason |
| --- | --- | --- | --- | --- |
| Facility-scoped medicine display list | Yes | Cached | 20 seconds | Read-heavy, explicitly allowlisted, display-only stock |
| BHW referral report aggregate | Yes | Cached | 120 seconds | Facility-scoped aggregate without patient rows |
| RHU referral/medicine/volume report aggregate | Yes | Cached | 120 seconds | Facility-scoped aggregate without patient rows |
| Active facility/reference lists | Potentially | Deferred | 5-30 minutes | Current endpoints are admin management responses with live counts, not dedicated reference endpoints |
| Doctor availability | Potentially | Not available | 15-30 seconds | AKAY currently has no doctor-availability API or model |
| Dashboard aggregate | Potentially | Not available | 30-60 seconds | AKAY currently composes dashboard data client-side and has no dedicated summary API |
| Admin report | Potentially | Deferred | 1-5 minutes | Includes audit activity and needs a separate reviewed allowlist/invalidation plan |
| Medicine inventory history | No | Excluded | None | Append-only operational ledger |
| Patient, health-record, referral-detail, feedback-detail, follow-up-detail | No | Excluded | None | Patient-level or clinical data |
| Authentication, profile, password reset, notifications, audit logs, QR, drafts, idempotency responses | No | Excluded | None | User-specific, secret, sensitive, or request-specific data |

## Keys and values

Protected keys use this shape:

```text
akay:v1:{domain}:{role}:{facility_type}:{facility_id}:g{generation}:f{filters_hash}:p{page}
```

Filters are recursively normalized, sorted, JSON encoded, and SHA-256 hashed.
Only controller-approved medicine filters and pagination enter that hash. Keys do
not contain patient identifiers, names, contact data, diagnoses, health-record or
referral IDs, QR tokens, bearer tokens, email addresses, operation keys, or raw
request bodies. User IDs are not used because cached values are shared only among
users with the same authorized role and facility.

Cached values are API-ready arrays. Eloquent models, authenticated users, request
objects, exceptions, SQL, bindings, credentials, and tokens are never cached.

## Authorization and database authority

The request order remains authentication, active-account middleware, facility
assignment validation, controller authorization/scope construction, cache key
construction, then cache lookup. Denials and errors are never cached.

Medicine cache values are display data only. Opening balance, restock, adjustment,
disposal, and dispensing continue to use PostgreSQL stored functions, row locks,
transactions, constraints, and the append-only ledger. Cached quantities are never
read by mutation code or stock validation.

## Invalidation map

| Committed mutation | Invalidated generations |
| --- | --- |
| BHC medicine create/update/archive/restock/adjust/dispose/dispense | BHW medicine list for that BHC |
| RHU medicine create/update/archive/restock/adjust/dispose | RHU medicine list, RHU report, and shared BHW RHU-availability feed |
| Referral create/status/no-show/delete/feedback | BHW report for source BHC and RHU report for receiving RHU |
| RHU patient-volume update | RHU report for that RHU |

Generation counters provide store-neutral invalidation without cache tags. Old
entries become unreachable immediately and expire through their short TTL. The
application never calls `Cache::flush()`.

Report recomputation uses a five-second atomic cache lock with at most a one-second
wait. The inspected file and database stores both implement Laravel locks. A lock
failure or timeout falls back to the authorized database query instead of making
the cache an availability dependency. Distributed stampede protection requires
all application instances to use the same shared cache and lock backend.

## Failure behavior and observability

Cache read, write, and generation failures produce sanitized logs containing only
the cache domain, operation, result, duration, and exception class. The authorized
database callback still runs and its result is returned. Cache failures never
expose keys, values, driver names, credentials, or exception messages to clients.

Local and testing responses include `X-AKAY-Cache: HIT`, `MISS`, or `BYPASS`.
Production responses do not expose this diagnostic header. Existing authenticated
response headers remain `Cache-Control: no-store, private`, `Pragma: no-cache`, and
`Vary: Authorization`; server-side caching does not enable browser or CDN caching.

## Repeatable measurement procedure

Use local or staging with dedicated non-PHI test data:

1. Bump only the selected endpoint's facility generation through an authorized
   mutation or a test-only service call. Never globally flush the cache.
2. Enable the database query listener and request the endpoint once. Record the
   `MISS`, elapsed time, and query count.
3. Repeat the identical authorized request. Record the `HIT`, elapsed time, and
   reduced query count.
4. Perform an authorized committed mutation affecting that facility.
5. Request again and confirm `MISS` plus fresh database values.
6. Request an unrelated facility and confirm its generation and cached response
   remain unchanged.

No representative staging workload or production topology has been selected.
The isolated measurement below is therefore not a production benchmark.

### Isolated implementation measurement

An opt-in contract-test measurement was run on 2026-07-21 with PHPUnit, an
in-memory SQLite database, and Laravel's array cache. It is implementation evidence,
not a capacity or production benchmark:

| Endpoint | Cold | Warm | Cold queries | Warm queries | TTL | Generation invalidation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `GET /api/medicines?per_page=25` | 357.37 ms | 9.84 ms | 4 | 1 | 20 s | 0.74 ms |

The same suite verifies that the first post-mutation request is a `MISS` with fresh
database data, while an unrelated facility remains a `HIT`. Run the measurement
again on the selected staging topology before making production capacity claims:

```powershell
$env:AKAY_CACHE_BENCHMARK='1'
php artisan test --filter=test_medicine_cache_records_miss_then_hit_with_identical_allowlisted_response
Remove-Item Env:AKAY_CACHE_BENCHMARK
```

## Production recommendation

Keep the file store only for local or a verified single-instance deployment. Before
scaling to multiple application instances, select and provision one shared managed
cache backend, test failure and eviction behavior, verify all instances use the same
prefix/store, and rerun isolation and invalidation tests. Redis is a reasonable
future option, but Phase 4B does not install, enable, or configure it.
