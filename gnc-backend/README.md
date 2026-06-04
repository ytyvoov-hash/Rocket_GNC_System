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
the `Authorization: Bearer <token>` header. Role enforcement is per-method:

| Verb | Minimum role |
|------|--------------|
| `GET` | `viewer` |
| `PATCH`, `POST`, `PUT` | `engineer` |
| `POST /missions/{id}/lock`, ARM/LAUNCH/ABORT | `operator` |
| `DELETE` | `admin` |

## Status (2026-05)

Initial bootstrap: every REST endpoint and WebSocket channel is **stubbed** —
they answer with valid JSON shapes but return `503 Service Unavailable` until
the underlying parser / database / sim engine is wired up. The frontend can
already connect, perform SSO, and receive valid (empty) responses, which
unblocks all FE-side integration testing.
