// gnc-backend/src/hal/native/UsbScan.h
//
// Single source of truth for USB serial-port enumeration. Both REST
// (`GET /api/v1/hardware/scan`) and the `/ws/hardware` 1 Hz pump call
// `enumerate_usb_serial_ports()` so the FE never sees two different
// answers for "what is plugged in right now".
//
// Backing implementation:
//   - Windows: SetupDiGetClassDevs(GUID_DEVINTERFACE_USB_DEVICE) +
//     SPDRP_HARDWAREID parsing for VID/PID, SPDRP_FRIENDLYNAME for
//     human label, and a /COM\d+/ regex on FRIENDLYNAME to extract the
//     COM port number ("dev"). No fake fallback; an empty vector is
//     returned when no devices are present.
//   - Other OS: returns an empty vector (TODO: udev / IOKit).
//
// VID:PID → role lookup is loaded from
// `schemas/android_usb_roles.schema.yaml` once on first call and cached.
// The cache reload pathway is `reload_role_table()`.

#pragma once

#include <nlohmann/json.hpp>

#include <cstdint>
#include <string>
#include <vector>

namespace gnc::backend::hal::native {

struct ScannedPort {
    std::string  name;            // human-friendly device name
    std::string  dev;             // COM3, /dev/ttyUSB0, …
    std::string  vid;             // "0x067B" (upper-case hex, 0x prefix)
    std::string  pid;             // "0x2303"
    std::string  suggested_role;  // role from VID:PID table; "UNKNOWN" if none
    std::string  status;          // "OK" if device is present
    std::uint64_t rx_bps;         // 0 — throughput accounting added later
    std::uint64_t tx_bps;         // 0
};

// Re-loads the role table from disk on next call. Safe to call from any
// thread; takes the table mutex.
void reload_role_table();

// Loads the VID:PID role table from android_usb_roles.schema.yaml at
// `path`. Called automatically the first time
// `enumerate_usb_serial_ports()` runs. Safe to call from any thread.
void load_role_table(const std::string& path);

// Performs a fresh enumeration. Cheap on Windows (~1-5 ms for typical
// device counts); safe to call every second. Returns empty vector on
// failure or unsupported platforms.
std::vector<ScannedPort> enumerate_usb_serial_ports();

// Wire-format (matches gnc-frontend/src/store/hardwareSlice.ts
// `HardwarePort`). Overlays `assignments` (loaded from the
// gnc_device_assignments.json file) onto each port's `assignedRole`.
nlohmann::json to_wire_json(const std::vector<ScannedPort>& ports,
                            const nlohmann::json&            assignments);

}  // namespace gnc::backend::hal::native
