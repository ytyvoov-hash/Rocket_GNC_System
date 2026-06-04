# Firmware ↔ Backend ICD — Path B (STM32H7)

**Status:** v8 P5.1 (minimal). Defines the interface between the Path B flight
firmware (`gnc-stm32`) and the ground backend (`gnc-backend`). Scope is the
skeleton needed for a HIL/bench loop; field-level telemetry packing and the
physical link layer are brought up during HIL.

## 1. Roles & invariants

- The **backend** is the authority for arming and launch (P0.2
  `LaunchAuthority`): it verifies a Keycloak JWT (RS256) and a hardware key
  before issuing `ARM` / `LAUNCH`. The firmware never self-arms.
- The **firmware** owns the real-time GNC loop and the fail-stop. It refuses
  commands that violate its state machine (`FlightState`) and enters
  `SAFE_MODE` autonomously on any fault (watchdog, estimator divergence, HAL
  error) regardless of the link.
- **INV-6:** a flight build (`GNC_FLIGHT_BUILD`) will not leave `SELFTEST` if
  `any_stubbed`, the auth bypass is compiled in, or the firmware image is
  unsigned / fails its SHA-256 check (`FlightBuildGuard`).

## 2. Command channel (backend → firmware)

| Command   | Precondition (firmware state) | Effect                         | Authority |
|-----------|-------------------------------|--------------------------------|-----------|
| `ARM`     | `SAFE`                        | `SAFE → ARMED`                 | backend JWT + hardware key |
| `DISARM`  | `ARMED`                       | `ARMED → SAFE`                 | backend JWT |
| `LAUNCH`  | `ARMED`                       | `ARMED → FLIGHT` (launch detect)| backend JWT + hardware key |
| `ABORT`   | any                           | `→ SAFE_MODE` (latched)        | backend JWT |

Mapped to firmware entrypoints: `FlightLoop::arm()`, `detect_launch()`,
`abort()`. `ABORT` is always honoured and is terminal until power-cycle.

## 3. Telemetry channel (firmware → backend)

Emitted once per GNC cycle (`FlightLoop::tick()` → `Telemetry`). Minimal frame:

| Field        | Type     | Units | Source                          |
|--------------|----------|-------|---------------------------------|
| `tick`       | u32      | —     | loop counter                    |
| `state`      | u8       | enum  | `FlightState`                   |
| `pos_n`      | f64[3]   | m     | ESKF estimate (NED)             |
| `vel_n`      | f64[3]   | m/s   | ESKF estimate (NED)             |
| `euler_rad`  | f64[3]   | rad   | ESKF quaternion → ZYX           |
| `fin_cmd_rad`| f64[n]   | rad   | allocator output                |
| `n_fins`     | i32      | —     | active surface count            |
| `nav_valid`  | bool     | —     | estimator validity              |
| `healthy`    | bool     | —     | false once a fault latched      |

The frame mirrors the SIL `SimFrame` fields so Path A vs Path B parity (a future
gate) can compare like-for-like.

## 4. Firmware identity & signing

- `release_manifest.yaml:path_b.firmware_sha256` is set by
  `scripts/sign_firmware.py` over the linked image.
- At boot the firmware recomputes the SHA-256 of its image region
  (`FirmwareSignature::verify`) and compares against the expected hash built in.
- `signing_key_id` is a placeholder for an asymmetric signature (ed25519 over
  the digest) once key management exists.

## 5. Out of scope (deferred)

- Physical link layer (radio/CAN framing, CRC, sequence numbers, backpressure).
- Full 103-column telemetry packing / HDF5 parity logs.
- Bidirectional config upload (gains/template) over the link.
