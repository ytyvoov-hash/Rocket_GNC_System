-- gnc-backend/db/migrations/001_init.sql
-- Block 3 — initial PostgreSQL schema for the GNC backend.
--
-- Convention:
--   • All ids are TEXT (UUID v4 strings, generated server-side by the
--     application layer; we don't depend on the uuid-ossp extension so
--     this script also runs under SQLite/MariaDB-compat for tests).
--   • Mutation timestamps are TIMESTAMPTZ stored UTC.
--   • Every mutating REST call is required to insert exactly one row in
--     `audit_log` (enforced by the AuditFilter Drogon middleware).
--   • `templates` and `missions` are versioned by (id, version) — a
--     template is never overwritten in-place; PATCH bumps `version`.
--
-- Idempotent: every CREATE uses `IF NOT EXISTS` so this script can run on
-- an empty DB or against an existing one without error.

-- ---------------------------------------------------------------------------
-- Schema-version metadata. Inspected at boot to drive future migrations.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_version (
    id              SMALLINT      PRIMARY KEY,
    applied_at      TIMESTAMPTZ   NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    applied_by      TEXT          NOT NULL DEFAULT 'system',
    description     TEXT          NOT NULL
);

INSERT INTO schema_version (id, description)
VALUES (1, 'Initial schema: templates, missions, runs, audit_log')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Rocket templates.  One row per (template_id, version).
--
-- The canonical YAML lives on disk in rockets/<id>/; this table caches the
-- parsed JSON for fast list/lookup and stores the immutable version chain.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS templates (
    id              TEXT          NOT NULL,
    version         INTEGER       NOT NULL DEFAULT 1,
    type            TEXT          NOT NULL,
    status          TEXT          NOT NULL DEFAULT 'draft',
    display_name    TEXT          NOT NULL,
    num_stages      INTEGER       NOT NULL,
    body_sha256     TEXT          NOT NULL,
    body_json       TEXT          NOT NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    created_by      TEXT          NOT NULL,
    PRIMARY KEY (id, version)
);

CREATE INDEX IF NOT EXISTS idx_templates_status ON templates(status);
CREATE INDEX IF NOT EXISTS idx_templates_type   ON templates(type);

-- ---------------------------------------------------------------------------
-- Missions.  Versioned the same way as templates.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS missions (
    id              TEXT          NOT NULL,
    version         INTEGER       NOT NULL DEFAULT 1,
    template_id     TEXT          NOT NULL,
    template_ver    INTEGER       NOT NULL,
    name            TEXT          NOT NULL,
    locked          BOOLEAN       NOT NULL DEFAULT FALSE,
    body_sha256     TEXT          NOT NULL,
    body_json       TEXT          NOT NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    created_by      TEXT          NOT NULL,
    PRIMARY KEY (id, version)
);

CREATE INDEX IF NOT EXISTS idx_missions_template ON missions(template_id, template_ver);
CREATE INDEX IF NOT EXISTS idx_missions_locked   ON missions(locked);

-- ---------------------------------------------------------------------------
-- Simulation runs.  Each /api/v1/simulation/start adds one row and the
-- backend updates `finished_at` / `result` / `flight_log_uri` when the run
-- completes (HDF5 blob stored on object storage out-of-band).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS runs (
    id              TEXT          PRIMARY KEY,
    mission_id      TEXT,
    mission_ver     INTEGER,
    template_id     TEXT,
    template_ver    INTEGER,
    started_at      TIMESTAMPTZ   NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    finished_at     TIMESTAMPTZ,
    started_by      TEXT          NOT NULL,
    result          TEXT          NOT NULL DEFAULT 'running',  -- running|completed|stopped|failed
    final_alt_msl_m DOUBLE PRECISION,
    final_t_s       DOUBLE PRECISION,
    flight_log_uri  TEXT,
    config_json     TEXT          NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_mission ON runs(mission_id, mission_ver);
CREATE INDEX IF NOT EXISTS idx_runs_result  ON runs(result);

-- ---------------------------------------------------------------------------
-- Audit log.  Append-only.  Every mutating REST request inserts exactly one
-- row.  v5.4 §A.7 mandates the (operator_id, reason) tuple for any change
-- that diverges from the canonical hardware mapping or library defaults.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL     PRIMARY KEY,
    at              TIMESTAMPTZ   NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    actor           TEXT          NOT NULL,             -- Keycloak preferred_username
    actor_role      TEXT,                               -- viewer|engineer|operator|admin
    operator_id     TEXT,                               -- mandatory on hardware deviations
    reason          TEXT,                               -- mandatory on hardware deviations
    method          TEXT          NOT NULL,             -- POST|PUT|PATCH|DELETE
    path            TEXT          NOT NULL,
    status          INTEGER       NOT NULL,             -- HTTP status
    target_kind     TEXT,                               -- template|mission|hardware|library|run
    target_id       TEXT,
    diff_json       TEXT,                               -- minimal JSON diff or full body fallback
    request_id      TEXT,                               -- correlates with logs / traces
    client_ip       TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_at        ON audit_log(at);
CREATE INDEX IF NOT EXISTS idx_audit_actor     ON audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_audit_target    ON audit_log(target_kind, target_id);

-- ---------------------------------------------------------------------------
-- View: latest version of each template / mission, for fast list endpoints.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW templates_latest AS
SELECT t.*
FROM templates t
JOIN (
    SELECT id, MAX(version) AS v FROM templates GROUP BY id
) m ON m.id = t.id AND m.v = t.version;

CREATE OR REPLACE VIEW missions_latest AS
SELECT m.*
FROM missions m
JOIN (
    SELECT id, MAX(version) AS v FROM missions GROUP BY id
) mv ON mv.id = m.id AND mv.v = m.version;
