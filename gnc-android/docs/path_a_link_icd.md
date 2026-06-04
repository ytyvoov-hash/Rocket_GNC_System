# Path A link ICD — Android ↔ STM32L431 over USB-CDC

**Status:** v8 P5.2 (minimal). Defines the wire protocol between the Android
host (`gnc-android`) and the STM32L431 peripheral that owns the hard-RT inner
loop. Transport is USB-CDC ACM at **921600 bps** (Plan v8 §3.7). The framing,
CRC and message layouts here are implemented and unit-tested in
`gnc-android/native` (`UsbCdcLink`, `Messages`).

## 1. Framing (HDLC-like)

```
0x7E | <stuffed( MSG_ID | PAYLOAD | CRC16_hi | CRC16_lo )> | 0x7E
```

- **Delimiter:** `0x7E` brackets every frame.
- **Byte stuffing:** inside the frame, `0x7E`→`0x7D 0x5E` and `0x7D`→`0x7D 0x5D`
  (escape `0x7D`, payload byte XOR `0x20`).
- **CRC:** **CRC-16/CCITT-FALSE** (poly `0x1021`, init `0xFFFF`, no reflect,
  xorout `0x0000`) computed over `MSG_ID || PAYLOAD` (pre-stuffing), transmitted
  big-endian. A frame failing CRC is dropped.
- Payload integers/floats are **little-endian**; floats are IEEE-754
  (`f32`/`f64`).

## 2. Messages

### `0x01 SENSOR` — L431 → Android (inner-loop snapshot, ~100 Hz)
| Field | Type | Units |
|-------|------|-------|
| `t_ns` | i64 | ns since L431 boot |
| `acc_b[3]` | f32×3 | m/s² (body) |
| `gyro_b[3]` | f32×3 | rad/s (body) |
| `lat`,`lon`,`alt` | f64×3 | deg, deg, m |
| `vel_n[3]` | f32×3 | m/s (NED) |
| `gps_valid` | u8 | 0/1 |
| `imu_valid` | u8 | 0/1 |

### `0x02 COMMAND` — Android → L431 (outer-loop output, ~10–50 Hz)
| Field | Type | Units |
|-------|------|-------|
| `n_fins` | u8 | active surfaces |
| `fin_cmd_rad[4]` | f32×4 | rad |
| `target_euler[3]` | f32×3 | rad (roll,pitch,yaw) |
| `mode` | u8 | 0 idle, 1 armed, 2 flight, 3 abort |

### `0x03 HEARTBEAT` — bidirectional (link-loss detection)
| Field | Type | |
|-------|------|--|
| `seq` | u32 | monotonic |
| `state` | u8 | sender state |

## 3. Safety

- The **L431** is the authority for actuation and fail-stop. On heartbeat
  timeout (missed `0x03` for N periods) it autonomously enters safe-mode
  regardless of the phone. The phone cannot keep the vehicle armed by silence.
- Arming/launch authority remains server-side (`gnc-backend` `LaunchAuthority`,
  P0.2); the phone relays operator intent, it does not self-authorise.

## 4. Out of scope (deferred)

- USB enumeration / accessory-vs-host role negotiation specifics.
- Sequence numbers / retransmit on the data messages (heartbeat covers liveness).
- Full 103-column telemetry; this is the minimal inner/outer-loop exchange.
