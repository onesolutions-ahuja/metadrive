# Versioned REST API

MetaDrive exposes an authenticated, versioned REST surface at
`/services/data/v1.0`. Requests use the same bearer session token, tenant
isolation, Object/Field/Record permissions, and shared Record Engine as the
first-party `/api` routes. This is a Salesforce-inspired compatibility layer,
not a claim of complete Salesforce API parity. Record IDs are MetaDrive UUIDs.

## Resources

- `GET /services/data` lists the supported API version.
- `GET /services/data/v1.0` lists the available resource families.
- `GET /services/data/v1.0/sobjects` lists readable Objects.
- `GET /services/data/v1.0/sobjects/{Object}/describe` returns readable fields
  and the caller's create/update/delete capabilities.
- `POST /services/data/v1.0/sobjects/{Object}` creates a record.
- `GET|PATCH|DELETE /services/data/v1.0/sobjects/{Object}/{Id}` reads, updates,
  and deletes a record. Updates return `204`; creates return an ID and success
  result.
- `GET /services/data/v1.0/query?q=...` accepts a bounded SOQL subset:
  field projections, one Object, literal comparisons, `IN`, `AND`/`OR`,
  parenthesized filters, `LIKE` prefix/contains patterns, sorting, `LIMIT`, and
  `OFFSET`. Pages contain at most 100 records; a `nextRecordsUrl` locator
  continues larger queries.
- `GET /services/data/v1.0/search?q=...` accepts one-object SOSL
  `FIND {...} IN ALL FIELDS RETURNING Object(fields)` queries. Search results
  are limited to the Object's configured searchable fields.
- `GET /services/data/v1.0/limits` reports MetaDrive page/batch caps and, when
  configured, the tenant's daily API request target and remaining count. That
  target is advisory and is not an enforced Salesforce-style quota.
- `GET /services/data/v1.0/event-stream/{EventApiName}` opens a server-sent
  event stream for an enabled Platform Event the caller may subscribe to.
  `replayId=-1` (the default) starts with events published after connection,
  `replayId=-2` replays retained events, and a non-negative decimal resumes
  strictly after that durable tenant-scoped replay ID. Event fields are
  delivered as JSON in the `payload` property. The transport is SSE; CometD
  and Pub/Sub gRPC protocols are not implemented.
- `POST /services/data/v1.0/composite/sobjects` and
  `PATCH /services/data/v1.0/composite/sobjects/{Object}` support up to 200
  same-Object creates or updates. `allOrNone` defaults to true; false allows
  individual failures.
- `POST /services/data/v1.0/composite/tree/{Object}` supports up to 200
  same-Object, flat records in one atomic import. Nested relationship trees
  are not yet supported.
- `POST /services/data/v1.0/composite` supports up to 25 independent sObject
  subrequests when `allOrNone` is explicitly false.
- `POST /services/data/v1.0/composite/batch` supports up to 25 independent
  sObject subrequests with optional `haltOnError`.

SOQL does not yet support relationship traversal, subqueries, aggregates,
functions, null predicates, or every Salesforce literal/type rule. Composite
subrequests do not yet support cross-request reference substitution, mixed
resource operations, or atomic rollback across independent operations.
Unsupported query and resource shapes fail explicitly rather than being
silently approximated.
