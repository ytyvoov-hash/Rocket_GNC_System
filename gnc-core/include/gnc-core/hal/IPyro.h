// gnc-core/hal/IPyro.h
// Pyrotechnic / GPIO fire-line abstraction. Used for separation nails,
// engine starters, warhead fuse, and other one-shot ignitions.

#pragma once

#include <string>
#include <vector>

namespace gnc::hal {

struct PyroChannel {
    std::string event_name;   // e.g. "SEP_NAIL_1_TO_2"
    bool armed{false};
    bool fired{false};
};

class IPyro {
public:
    virtual ~IPyro() = default;

    // Returns the current state of every channel declared in hardware_mapping.yaml.
    virtual std::vector<PyroChannel> channels() const = 0;

    // Two-key safety: arm + fire are separate calls; the flight state machine
    // is responsible for sequencing and authorisation.
    virtual bool arm(const std::string& event_name) = 0;
    virtual bool fire(const std::string& event_name) = 0;

    // Disarm all channels (called on abort).
    virtual void disarm_all() = 0;
};

}  // namespace gnc::hal
