// gnc-stm32/FlightState.h
//
// v8 P5.1 (Embedded). Flight-software state machine for the Path B target.
// The audit found no firmware on either path; this is the minimal on-target
// state model hosting gnc-core over the HAL.
//
// Transitions (the only legal edges; anything else is rejected):
//
//   Boot ──► SelfTest ──► Safe ──► Armed ──► Flight ──► Descent ──► Safe
//                           ▲                                         │
//                           └─────────────────────────────────────────┘
//   (any) ──► SafeMode      (watchdog trip / fault / abort; terminal until reboot)
//
// SafeMode is the fail-stop sink: pyros disarmed, fins neutralised, no further
// control authority until the board is power-cycled.

#pragma once

#include <cstdint>

namespace gnc::stm32 {

enum class FlightState : std::uint8_t {
    Boot     = 0,  // power-on, nothing initialised
    SelfTest = 1,  // HAL probe + flight-build guard + nav/controller init
    Safe     = 2,  // healthy, disarmed, on the pad
    Armed    = 3,  // operator-armed, awaiting launch detect
    Flight   = 4,  // powered/coast ascent under closed-loop control
    Descent  = 5,  // post-apogee
    SafeMode = 6,  // fail-stop sink (terminal until reboot)
};

inline const char* to_string(FlightState s) {
    switch (s) {
        case FlightState::Boot:     return "BOOT";
        case FlightState::SelfTest: return "SELFTEST";
        case FlightState::Safe:     return "SAFE";
        case FlightState::Armed:    return "ARMED";
        case FlightState::Flight:   return "FLIGHT";
        case FlightState::Descent:  return "DESCENT";
        case FlightState::SafeMode: return "SAFE_MODE";
    }
    return "UNKNOWN";
}

// Legal forward transition check (SafeMode is reachable from anywhere and is
// handled separately, so it is not listed here).
inline bool is_legal_transition(FlightState from, FlightState to) {
    switch (from) {
        case FlightState::Boot:     return to == FlightState::SelfTest;
        case FlightState::SelfTest: return to == FlightState::Safe;
        case FlightState::Safe:     return to == FlightState::Armed;
        case FlightState::Armed:    return to == FlightState::Flight ||
                                            to == FlightState::Safe;   // disarm
        case FlightState::Flight:   return to == FlightState::Descent;
        case FlightState::Descent:  return to == FlightState::Safe;
        case FlightState::SafeMode: return false;                      // terminal
    }
    return false;
}

}  // namespace gnc::stm32
