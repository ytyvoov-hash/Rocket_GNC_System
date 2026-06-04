# gnc-backend

C++17 + **Drogon** backend serving the Web GCS frontend.

Implements:

- All 25 REST endpoints documented in §5.1 of the internal-system build plan.
- Three WebSocket channels: `/ws/telemetry` (binary MisPlot 77 B @ 50 Hz),
  `/ws/simulation/{runId}` (binary sim frames), `/ws/hardware` (JSON 1 Hz health).
- Keycloak JWT verification (RS256) with RBAC (`viewer`, `engineer`, `operator`, `admin`).
- Audit log (append-only PostgreSQL table; 5-year retention).
- Template parser + C1–C25 validator (Stream B).
- In-process simulation engine (links `gnc-core` directly — no IPC).
- Telemetry gateway: re-emits TCP-5900 MCTU frames over the WebSocket.

## Build

Requires:

- CMake ≥ 3.20
- A C++20 compiler (Drogon coroutine support; `gnc-core` itself stays C++17 per Decision 4)
- Conan 2 or vcpkg for dependencies

```bash
# Conan
conan install . --output-folder=build --build=missing
cmake -S . -B build -DCMAKE_TOOLCHAIN_FILE=conan_toolchain.cmake
cmake --build build -j

# Or vcpkg
cmake --preset vcpkg
cmake --build out/build/vcpkg -j
```

## Run

Local dev with hot-reload (Drogon supports config-driven hot-reload of routes):

```bash
./build/gnc-backend ./config/dev.json
```

The frontend dev proxy (`gnc-frontend/vite.config.ts`) targets `http://localhost:8080`,
which matches the default port in `config/dev.json`.

## Docker

```bash
docker compose up
```

Brings up: nginx → gnc-backend → postgres+TimescaleDB → minio → keycloak.

## Directory layout

```
gnc-backend/
├── CMakeLists.txt
├── conanfile.txt
├── Dockerfile
├── docker-compose.yml
├── config/
│   ├── dev.json
│   └── prod.json
├── src/
│   ├── main.cc
│   ├── controllers/      (10 REST endpoint groups)
│   ├── ws/               (3 WebSocket channels)
│   ├── auth/             (Keycloak JWT verify + audit filter)
│   ├── parser/           (Stream B — 11-file template ingest)
│   ├── validator/        (C1–C25 functions, one per clause)
│   ├── sim/              (simulation engine, links gnc-core)
│   ├── db/               (Drogon ORM models)
│   └── storage/          (MinIO + HDF5 readers/writers)
└── tests/                (gtest; Tier 1 CI)
```

## Configuration files

- `config/dev.json`: developer config — local PG, MinIO, Keycloak; no TLS.
- `config/prod.json`: production — TLS 1.3, mTLS for service-to-service.

## API authentication

All REST endpoints (except `/api/v1/health`) require a valid Keycloak JWT in
the `Authorization: Bearer <token>` header. The token is verified server-side
(`src/auth/JwtVerifier`): RS256 signature against the realm JWKS (matched by
`kid`, public key from the JWK `x5c`), plus `exp`/`nbf` (with `leeway_s`),
and `iss`/`aud` when `require_issuer` / `require_audience` are set. The role is
the highest entry of `realm_access.roles[]`. There is **no** `X-Dev-Role`
trust path — roles come only from a verified token.

Enforcement is per-route, attached as Drogon filters
(`ViewerOnly`/`EngineerOnly`/`OperatorOnly`/`AdminOnly`) in each controller's
`METHOD_LIST`. A request below the required role gets `401` (no/invalid token)
or `403` (authenticated but under-privileged).

| Route(s) | Minimum role |
|----------|--------------|
| `GET /api/v1/health` | (open) |
| Read endpoints (`GET` templates/missions/hardware/libraries/sim-log) | `viewer` |
| `POST`/`PUT`/`PATCH`/`POST …/validate`/`…/duplicate`, `POST /simulation/*` | `engineer` |
| `PUT /hardware/assignments`, `POST /missions/{id}/lock`, `GET /audit` | `operator` |
| `DELETE /templates/{id}` | `admin` |

### Verifier configuration (`custom_config.keycloak`)

```jsonc
"keycloak": {
  "issuer":           "http://localhost:8081/realms/gnc",
  "audience":         "gnc-frontend",
  "jwks_file":        "./config/keycloak_jwks.json",  // or inline "jwks": "<JSON>"
  "require_issuer":   true,
  "require_audience": false,
  "leeway_s":         60
}
```

Provide the realm signing keys via `jwks_file` (or inline `jwks`). Refresh the
file from the realm's `jwks_uri` when keys rotate
(`curl -s "$jwks_uri" -o config/keycloak_jwks.json`); see
`config/keycloak_jwks.example.json`. **Live JWKS-URI fetch + automatic key
rotation inside the backend is a tracked follow-up** — today the document is
read from config at startup. If no JWKS is configured the verifier is
fail-closed: every guarded route returns `401`.

### Dev bypass & release hardening (v8 INV-6)

For local development, building with `-DGNC_ALLOW_AUTH_BYPASS=ON` (the default)
and running with `GNC_AUTH_DISABLED=1` makes every request resolve to `admin`
(logged loudly). Release / flight builds **must** configure
`-DGNC_ALLOW_AUTH_BYPASS=OFF`, which compiles the bypass out of the binary
entirely so the env var has no effect.

> ARM / LAUNCH / ABORT are not yet server endpoints — the launch interlock is
> still enforced only in the frontend. A server-authenticated
> ARM/LAUNCH/ABORT path (operator role + hardware-key check) is the next slice
> of this work.

## Status (2026-05)

Initial bootstrap: every REST endpoint and WebSocket channel is **stubbed** —
they answer with valid JSON shapes but return `503 Service Unavailable` until
the underlying parser / database / sim engine is wired up. The frontend can
already connect, perform SSO, and receive valid (empty) responses, which
unblocks all FE-side integration testing.
