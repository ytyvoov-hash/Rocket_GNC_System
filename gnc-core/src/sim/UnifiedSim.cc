// gnc-core/src/sim/UnifiedSim.cc

#include "gnc-core/sim/UnifiedSim.h"
#include "gnc-core/sim/ThreeDOFIntegrator.h"
#include "gnc-core/sim/TuningIntegrator.h"
#include "gnc-core/sim/Full6DOFIntegrator.h"
#include "gnc-core/control/ControllerFactory.h"
#include <stdexcept>

namespace gnc::sim {

UnifiedSim::UnifiedSim(SimConfig cfg, Mode mode)
    : cfg_(std::move(cfg)), mode_(mode)
{
    // Auto-load CSV tables if not provided (Phase 3: Subsystems & CSV Parsing)
    if (!cfg_.atmosphere_table) {
        cfg_.atmosphere_table = std::make_shared<AtmosphereTable>();
        cfg_.atmosphere_table->loadFromCsv("Reference-data/atmosphere_table.csv");
    }
    if (!cfg_.thrust_curve) {
        cfg_.thrust_curve = std::make_shared<ThrustCurve>();
        cfg_.thrust_curve->loadFromCsv("Reference-data/thrust_curve.csv");
    }
    if (!cfg_.aero_coeffs) {
        cfg_.aero_coeffs = std::make_shared<AeroCoeffs>();
        cfg_.aero_coeffs->loadFromCsv("Reference-data/aero_coeffs.csv");
    }

    instantiateIntegrator();
}

UnifiedSim::~UnifiedSim() = default;

void UnifiedSim::instantiateIntegrator()
{
    switch (mode_) {
        case Mode::ThreeDOF:
            active_integrator_ = std::make_unique<ThreeDOFIntegrator>(cfg_);
            break;
        case Mode::Tuning:
            active_integrator_ = std::make_unique<TuningIntegrator>(cfg_);
            break;
        case Mode::Full:
            active_integrator_ = std::make_unique<Full6DOFIntegrator>(cfg_);
            break;
        default:
            throw std::runtime_error("Invalid simulation mode");
    }
}

SimFrame UnifiedSim::step()
{
    return active_integrator_->step();
}

void UnifiedSim::setMode(Mode mode)
{
    if (mode_ != mode) {
        mode_ = mode;
        instantiateIntegrator();
    }
}

void UnifiedSim::updateTuningParams(const TuningParams& params)
{
    cfg_.tuning.pid_gains = params;
    auto [ctrl, alloc] = control::ControllerFactory::create(params);
    cfg_.controller = ctrl;
    cfg_.allocator = alloc;
    active_integrator_->updateTuningParams(params);
}

const SimFrame& UnifiedSim::current() const
{
    return active_integrator_->current();
}

bool UnifiedSim::finished() const
{
    return active_integrator_->current().finished;
}

void UnifiedSim::reset()
{
    active_integrator_->reset();
}

const SimConfig& UnifiedSim::config() const
{
    return cfg_;
}

}  // namespace gnc::sim
