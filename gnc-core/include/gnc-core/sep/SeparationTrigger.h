// gnc-core/sep/SeparationTrigger.h
// Day-1 separation-trigger registry (v5.4 Decision 16).
// All five values ship from day 1; clause C17 validates completeness.

#pragma once

#include <cstdint>
#include <string>
#include <string_view>

namespace gnc::sep {

enum class Trigger : std::uint8_t {
    Burnout  = 0,
    Time     = 1,
    Altitude = 2,
    Velocity = 3,
    Event    = 4,
};

inline std::string_view to_string(Trigger t) {
    switch (t) {
        case Trigger::Burnout:  return "burnout";
        case Trigger::Time:     return "time";
        case Trigger::Altitude: return "altitude";
        case Trigger::Velocity: return "velocity";
        case Trigger::Event:    return "event";
    }
    return "unknown";
}

inline bool from_string(std::string_view s, Trigger& out) {
    if (s == "burnout")  { out = Trigger::Burnout;  return true; }
    if (s == "time")     { out = Trigger::Time;     return true; }
    if (s == "altitude") { out = Trigger::Altitude; return true; }
    if (s == "velocity") { out = Trigger::Velocity; return true; }
    if (s == "event")    { out = Trigger::Event;    return true; }
    return false;
}

}  // namespace gnc::sep
