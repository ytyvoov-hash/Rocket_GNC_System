// gnc-core/actuator/IActuator.h
// Polymorphic actuator model used by the simulation engine. Four concrete
// implementations: SecondOrderWithDelay, FirstOrder, Ideal, Electromechanical.
// AerospikeActuatorStub is registered but fails closed (Decision 16).

#pragma once

namespace gnc::actuator {

struct ActuatorState {
    double position_deg{0};
    double rate_deg_s{0};
    bool rate_limited{false};
    bool position_limited{false};
};

class IActuator {
public:
    virtual ~IActuator() = default;

    // Step the actuator one simulation tick. `demand_deg` is the commanded
    // deflection; the actuator emits the realised state.
    virtual ActuatorState step(double demand_deg, double dt_s) = 0;

    virtual void reset(double initial_position_deg) = 0;

    // Datasheet limits (from actuator_library.yaml).
    virtual double delta_max_deg() const = 0;
    virtual double delta_min_deg() const = 0;
    virtual double rate_max_deg_s() const = 0;
};

}  // namespace gnc::actuator
