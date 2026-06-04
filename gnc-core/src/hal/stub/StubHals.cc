// gnc-core/src/hal/stub/StubHals.cc
// In-process stub HAL implementations (v5.4 §1.5.2).
// All stubs are safe to use on a bench machine with no peripherals attached.
// Flight binaries refuse to load these (HalFactory enforces flight_build).

#include "gnc-core/hal/HalFactory.h"

#include <chrono>
#include <cstdint>
#include <map>
#include <string>
#include <vector>

namespace gnc::hal {

// -------- Stub Clock: monotonic wall-clock seconds since program start ----
class StubClock final : public IClock {
public:
    StubClock() { t0_ = std::chrono::steady_clock::now(); }
    TimePoint now() const override {
        auto delta = std::chrono::steady_clock::now() - t0_;
        return TimePoint{std::chrono::duration_cast<std::chrono::nanoseconds>(delta).count()};
    }
    void sleep_until(TimePoint /*until*/) override { /* bench-only no-op */ }
private:
    std::chrono::steady_clock::time_point t0_;
};

// -------- Stub IMU: emits zero acceleration except gravity in body Z -----
class StubImu final : public IImu {
public:
    ImuSample poll() override {
        ImuSample s;
        s.t = TimePoint{0};
        s.acc_b = Vec3{0.0, 0.0, 9.80665};   // gravity in body frame at rest
        s.gyro_b = Vec3{};
        s.temp_c = 25.0;
        s.valid = true;
        return s;
    }
    double nominal_rate_hz() const override { return 1000.0; }
};

// -------- Stub GPS: NO_FIX -----------------------------------------------
class StubGps final : public IGps {
public:
    GpsSample poll() override { return GpsSample{}; }
    bool present() const override { return false; }
};

// -------- Stub CAN: in-memory log; never drives a wire -------------------
class StubCan final : public ICan {
public:
    bool send(const CanFrame& f) override {
        tx_log_.push_back(f);
        return true;
    }
    bool recv(CanFrame& /*out*/) override { return false; }
    double utilisation_pct() const override { return 0.0; }
    const std::vector<CanFrame>& tx_log() const { return tx_log_; }
private:
    std::vector<CanFrame> tx_log_;
};

// -------- Stub Pyro: records arm/fire commands but never drives GPIO -----
class StubPyro final : public IPyro {
public:
    std::vector<PyroChannel> channels() const override {
        std::vector<PyroChannel> out;
        for (const auto& [name, ch] : state_) out.push_back(ch);
        return out;
    }
    bool arm(const std::string& event_name) override {
        state_[event_name].event_name = event_name;
        state_[event_name].armed = true;
        return true;
    }
    bool fire(const std::string& event_name) override {
        if (state_[event_name].armed) {
            state_[event_name].fired = true;
            return true;
        }
        return false;
    }
    void disarm_all() override {
        for (auto& [k, v] : state_) v.armed = false;
    }
private:
    std::map<std::string, PyroChannel> state_;
};

// -------- Stub Radio: discards frames but tracks count -------------------
class StubRadio final : public IRadio {
public:
    bool send(const std::uint8_t*, std::size_t) override { ++tx_count_; return true; }
    double link_quality() const override { return 0.0; }
    std::uint32_t frequency_khz() const override { return freq_khz_; }
    void set_frequency_khz(std::uint32_t f) override { freq_khz_ = f; }
private:
    std::uint64_t tx_count_{0};
    std::uint32_t freq_khz_{418000};
};

// -------- Stub Thermal: constant safe values -----------------------------
class StubThermal final : public IThermal {
public:
    ThermalSample sample() override {
        return ThermalSample{35.0, 5.0, 4096, 0};
    }
};

// -------- Stub Fins: records commands; never drives a servo --------------
class StubFinDriver final : public IFinDriver {
public:
    bool send(const std::vector<FinCommand>& cmds) override {
        cmds_log_.insert(cmds_log_.end(), cmds.begin(), cmds.end());
        return true;
    }
    std::vector<FinFeedback> feedback() override { return {}; }
    std::uint8_t fin_count() const override { return 4; }
private:
    std::vector<FinCommand> cmds_log_;
};

// -------- Stub Seeker: always Idle ---------------------------------------
class StubSeeker final : public ISeeker {
public:
    SeekerLos poll() override {
        SeekerLos l;
        l.mode = SeekerMode::Idle;
        l.valid = false;
        return l;
    }
    bool request_mode(SeekerMode /*m*/) override { return false; }
};

// -------- Factory entry points used by HalFactory.cc ---------------------
std::unique_ptr<IClock>     make_stub_clock()    { return std::make_unique<StubClock>(); }
std::unique_ptr<IImu>       make_stub_imu()      { return std::make_unique<StubImu>(); }
std::unique_ptr<IGps>       make_stub_gps()      { return std::make_unique<StubGps>(); }
std::unique_ptr<ICan>       make_stub_can()      { return std::make_unique<StubCan>(); }
std::unique_ptr<IPyro>      make_stub_pyro()     { return std::make_unique<StubPyro>(); }
std::unique_ptr<IRadio>     make_stub_radio()    { return std::make_unique<StubRadio>(); }
std::unique_ptr<IThermal>   make_stub_thermal()  { return std::make_unique<StubThermal>(); }
std::unique_ptr<IFinDriver> make_stub_fins()     { return std::make_unique<StubFinDriver>(); }
std::unique_ptr<ISeeker>    make_stub_seeker()   { return std::make_unique<StubSeeker>(); }

}  // namespace gnc::hal
