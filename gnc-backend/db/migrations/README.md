# gnc-backend / db / migrations

PostgreSQL schema for the GNC backend, applied at server boot via the
`db.run_migrations` flag in `config/dev.json` (idempotent).

## File naming

`<NNN>_<lowercase_description>.sql` — files are applied in lexical order.
The currently applied version is tracked in the `schema_version` table.

## Tables

| table        | purpose                                              | key                  |
|--------------|------------------------------------------------------|----------------------|
| `templates`  | rocket templates, versioned                           | (id, version)        |
| `missions`   | mission files, versioned                              | (id, version)        |
| `runs`       | simulation runs (one row per /api/v1/simulation/start) | id                  |
| `audit_log`  | append-only mutation trail (one row per mutating call) | id (BIGSERIAL)      |
| `schema_version` | applied migration tracker                         | id                   |

## Audit-log contract

The `AuditFilter` Drogon middleware (`src/auth/AuditFilter.cc`) writes one row
to `audit_log` for every successful or failed mutating request:

- `method` ∈ {POST, PUT, PATCH, DELETE}
- `actor` is the Keycloak `preferred_username` (or `dev` in dev mode)
- `operator_id` and `reason` are extracted from the `X-Operator-ID` /
  `X-Reason` headers and are **required** for any request that PATCHes
  hardware mappings or PUTs device assignments (per v5.4 §A.7).

## Local dev

```sh
psql -h localhost -U gnc -d gnc -f 001_init.sql
```

The repo's `docker compose up` brings up Postgres 16 with this script mounted
into `/docker-entrypoint-initdb.d/` so a fresh container is auto-seeded.
