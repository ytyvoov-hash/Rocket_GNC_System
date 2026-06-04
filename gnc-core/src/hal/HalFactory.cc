// gnc-core/src/hal/HalFactory.cc
// Native-or-stub HAL resolution. See v5.4 §1.5.

#include "gnc-core/hal/HalFactory.h"

#include <stdexcept>

namespace gnc::hal {

// Forward declarations of stub builders (defined in stub/*.cc).
std::unique_ptr<IClock>     make_stub_clock();
std::unique_ptr<IImu>       make_stub_imu();
std::unique_ptr<IGps>       make_stub_gps();
std::unique_ptr<ICan>       make_stub_can();
std::unique_ptr<IPyro>      make_stub_pyro();
std::unique_ptr<IRadio>     make_stub_radio();
std::unique_ptr<IThermal>   make_stub_thermal();
std::unique_ptr<IFinDriver> make_stub_fins();
std::unique_ptr<ISeeker>    make_stub_seeker();

namespace {

// Factory function pointers. Default to nullptr; platform wrappers register
// implementations before build_default() is called.
ClockFactory    g_clock_factory   = nullptr;
ImuFactory      g_imu_factory     = nullptr;
GpsFactory      g_gps_factory     = nullptr;
CanFactory      g_can_factory     = nullptr;
PyroFactory     g_pyro_factory    = nullptr;
RadioFactory    g_radio_factory   = nullptr;
ThermalFactory  g_thermal_factory = nullptr;
FinFactory      g_fin_factory     = nullptr;
SeekerFactory   g_seeker_factory  = nullptr;

template <typename T, typename Factory>
std::unique_ptr<T> resolve(Factory f, std::unique_ptr<T> (*stub)(), bool flight_build, bool& any_stubbed) {
    if (f != nullptr) {
        auto native = f();
        if (native) return native;
    }
    if (flight_build) {
        throw std::runtime_error("flight_build=true and native HAL probe failed (v5.4 §1.5.1)");
    }
    any_stubbed = true;
    return stub();
}

}  // namespace

HalSet build_default(bool flight_build) {
    HalSet hs;
    hs.clock   = resolve<IClock>(g_clock_factory,     make_stub_clock,   flight_build, hs.any_stubbed);
    hs.imu     = resolve<IImu>(g_imu_factory,         make_stub_imu,     flight_build, hs.any_stubbed);
    hs.gps     = resolve<IGps>(g_gps_factory,         make_stub_gps,     flight_build, hs.any_stubbed);
    hs.can     = resolve<ICan>(g_can_factory,         make_stub_can,     flight_build, hs.any_stubbed);
    hs.pyro    = resolve<IPyro>(g_pyro_factory,       make_stub_pyro,    flight_build, hs.any_stubbed);
    hs.radio   = resolve<IRadio>(g_radio_factory,     make_stub_radio,   flight_build, hs.any_stubbed);
    hs.thermal = resolve<IThermal>(g_thermal_factory, make_stub_thermal, flight_build, hs.any_stubbed);
    hs.fins    = resolve<IFinDriver>(g_fin_factory,   make_stub_fins,    flight_build, hs.any_stubbed);
    hs.seeker  = resolve<ISeeker>(g_seeker_factory,   make_stub_seeker,  flight_build, hs.any_stubbed);
    return hs;
}

void register_clock_factory(ClockFactory f)     { g_clock_factory   = f; }
void register_imu_factory(ImuFactory f)         { g_imu_factory     = f; }
void register_gps_factory(GpsFactory f)         { g_gps_factory     = f; }
void register_can_factory(CanFactory f)         { g_can_factory     = f; }
void register_pyro_factory(PyroFactory f)       { g_pyro_factory    = f; }
void register_radio_factory(RadioFactory f)     { g_radio_factory   = f; }
void register_thermal_factory(ThermalFactory f) { g_thermal_factory = f; }
void register_fin_factory(FinFactory f)         { g_fin_factory     = f; }
void register_seeker_factory(SeekerFactory f)   { g_seeker_factory  = f; }

}  // namespace gnc::hal
