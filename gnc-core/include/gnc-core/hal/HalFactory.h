// gnc-core/hal/HalFactory.h
// Resolves every HAL interface to either a native implementation supplied by
// the platform wrapper (gnc-android / gnc-stm32 / gnc-backend), or the
// in-process stub for bench / dev runs (v5.4 §1.5).

#pragma once

#include "IClock.h"
#include "IImu.h"
#include "IGps.h"
#include "ICan.h"
#include "IPyro.h"
#include "IRadio.h"
#include "IThermal.h"
#include "IFinDriver.h"
#include "ISeeker.h"

#include <memory>

namespace gnc::hal {

struct HalSet {
    std::unique_ptr<IClock>     clock;
    std::unique_ptr<IImu>       imu;
    std::unique_ptr<IGps>       gps;
    std::unique_ptr<ICan>       can;
    std::unique_ptr<IPyro>      pyro;
    std::unique_ptr<IRadio>     radio;
    std::unique_ptr<IThermal>   thermal;
    std::unique_ptr<IFinDriver> fins;
    std::unique_ptr<ISeeker>    seeker;

    // True when at least one interface fell back to the stub.
    bool any_stubbed{false};
};

// Build-tag-aware loader.
//
// At process start, callers must invoke build_default(flight_build) once.
//
// - flight_build = false:  prefer native, fall back to stub per interface.
// - flight_build = true:   any failed native probe is fatal (§1.5.1).
//
// Native implementations register themselves with the factory before
// build_default is called (see gnc-backend / gnc-android / gnc-stm32).
HalSet build_default(bool flight_build);

// Registration entry points used by platform wrappers (no-op linkage when the
// wrapper is absent — that interface resolves to the stub).
using ClockFactory    = std::unique_ptr<IClock>     (*)();
using ImuFactory      = std::unique_ptr<IImu>       (*)();
using GpsFactory      = std::unique_ptr<IGps>       (*)();
using CanFactory      = std::unique_ptr<ICan>       (*)();
using PyroFactory     = std::unique_ptr<IPyro>      (*)();
using RadioFactory    = std::unique_ptr<IRadio>     (*)();
using ThermalFactory  = std::unique_ptr<IThermal>   (*)();
using FinFactory      = std::unique_ptr<IFinDriver> (*)();
using SeekerFactory   = std::unique_ptr<ISeeker>    (*)();

void register_clock_factory(ClockFactory f);
void register_imu_factory(ImuFactory f);
void register_gps_factory(GpsFactory f);
void register_can_factory(CanFactory f);
void register_pyro_factory(PyroFactory f);
void register_radio_factory(RadioFactory f);
void register_thermal_factory(ThermalFactory f);
void register_fin_factory(FinFactory f);
void register_seeker_factory(SeekerFactory f);

}  // namespace gnc::hal
