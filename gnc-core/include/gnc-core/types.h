// gnc-core/types.h
// Core math and frame types used throughout the library.
// Pure C++17. No external dependencies. No platform headers.

#pragma once

#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace gnc {

// ---------------------------------------------------------------------------
// Unified math constants
// ---------------------------------------------------------------------------
inline constexpr double PI      = 3.14159265358979323846;
inline constexpr double DEG2RAD = PI / 180.0;
inline constexpr double RAD2DEG = 180.0 / PI;

// ---------------------------------------------------------------------------
// Reference frames  (v5.4 §3.0)
// ---------------------------------------------------------------------------
enum class Frame : std::uint8_t {
    Body,    // Body-fixed (b)
    NED,     // North-East-Down (n)
    ECEF,    // Earth-Centered Earth-Fixed (e)
    Wind,    // Wind frame
};

// ---------------------------------------------------------------------------
// Small fixed-size vector and quaternion. Frame is encoded in the suffix of
// the variable name (e.g. `r_n`, `v_n`, `q_b_n`) per v5.4 §3.0 convention.
// ---------------------------------------------------------------------------
struct Vec3 {
    double x{0.0};
    double y{0.0};
    double z{0.0};

    Vec3() = default;
    Vec3(double xx, double yy, double zz) : x(xx), y(yy), z(zz) {}

    double norm_sq() const { return x*x + y*y + z*z; }
};

struct Quat {
    // Hamiltonian convention. (w, x, y, z), w scalar.
    double w{1.0};
    double x{0.0};
    double y{0.0};
    double z{0.0};
};

struct Matrix3x3 {
    double m[3][3] = {{0.0}};

    Matrix3x3() = default;
    Matrix3x3(double m00, double m01, double m02,
              double m10, double m11, double m12,
              double m20, double m21, double m22) {
        m[0][0] = m00; m[0][1] = m01; m[0][2] = m02;
        m[1][0] = m10; m[1][1] = m11; m[1][2] = m12;
        m[2][0] = m20; m[2][1] = m21; m[2][2] = m22;
    }
};

struct TuningParams {
    std::string algorithm{"PID"};
    std::string controller_type{"fins"};
    
    // PID
    double kp{1.0};
    double ki{0.1};
    double kd{0.01};
    
    // LQR / SDRE
    std::vector<double> Q;
    std::vector<double> R;
    std::vector<double> K;

    // Fin allocation geometry (template-driven). Defaults to the canonical
    // 4-fin "+"; a vehicle template supplies its own count/layout/effectiveness
    // so the core allocator needs no per-vehicle edits.
    int n_fins{4};
    std::string fin_layout{"cruciform"};  // "cruciform" | "ring" | "canard"
    double Cl_delta{0.01};                 // roll effectiveness  (per rad)
    double Cm_delta{0.05};                 // pitch effectiveness (per rad)
    double Cn_delta{0.05};                 // yaw effectiveness   (per rad)
    double fin_delta_max_rad{0.35};        // per-fin position limit
};

// ---------------------------------------------------------------------------
// Time stamp. Always monotonic; populated by the platform clock via IClock.
// ---------------------------------------------------------------------------
struct TimePoint {
    std::int64_t ns_since_boot{0};
};

// ---------------------------------------------------------------------------
// Flight phase enum — mirrors the 7-value phase code used in the MisPlot
// frame and in gnc-frontend/src/store/telemetrySlice.ts.
// ---------------------------------------------------------------------------
enum class FlightPhase : std::uint8_t {
    Prelaunch  = 0,
    BoostS1    = 1,
    CoastS1    = 2,
    Sep1to2    = 3,
    BoostS2    = 4,
    CoastS2    = 5,
    Terminal   = 6,
};

// ---------------------------------------------------------------------------
// Result type. Lightweight Either<T, error_string> for routines that may fail.
// ---------------------------------------------------------------------------
template <typename T>
struct Result {
    bool ok{false};
    T value{};
    std::string error{};

    static Result success(T v) { return {true, std::move(v), {}}; }
    static Result failure(std::string e) { return {false, {}, std::move(e)}; }
};

}  // namespace gnc
