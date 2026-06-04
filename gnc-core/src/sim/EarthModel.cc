#include "gnc-core/sim/EarthModel.h"
#include <cmath>
#include <algorithm>

namespace gnc::sim {

// ---------------------------------------------------------------------------
// Helper: WGS84 prime vertical radius of curvature
// ---------------------------------------------------------------------------
double EarthModel::prime_vertical_radius(double sin_lat) {
    return RE / std::sqrt(1.0 - E2 * sin_lat * sin_lat);
}

// ---------------------------------------------------------------------------
// Constructor — caches launch ECEF position and NED→ECEF DCM
// ---------------------------------------------------------------------------
EarthModel::EarthModel(const EarthModelParams& params) {
    lat_rad_ = params.launch_latitude_deg * gnc::DEG2RAD;
    lon_rad_ = params.launch_longitude_deg * gnc::DEG2RAD;

    // Compute launch-site ECEF position (at h=0)
    double slat = std::sin(lat_rad_);
    double clat = std::cos(lat_rad_);
    double slon = std::sin(lon_rad_);
    double clon = std::cos(lon_rad_);
    double N = prime_vertical_radius(slat);

    r_ecef_launch_ = {
        N * clat * clon,
        N * clat * slon,
        N * (1.0 - E2) * slat
    };

    // Compute and cache the NED→ECEF DCM at launch site
    dcm_ned2ecef_launch_ = dcm_ned_to_ecef(lat_rad_, lon_rad_);
}

// ---------------------------------------------------------------------------
// Existing NED gravity model (unchanged)
// ---------------------------------------------------------------------------
Vec3 EarthModel::compute_gravity_ned(const Vec3& r_ned) const {
    double alt = -r_ned.z;
    double r_mag = RE + alt;

    double r_ratio = RE / r_mag;
    double sin_lat = std::sin(lat_rad_);

    double g0 = MU / (r_mag * r_mag);
    double j2_radial = 1.5 * J2 * (r_ratio * r_ratio) * (3.0 * sin_lat * sin_lat - 1.0);
    double g_mag = g0 * (1.0 + j2_radial);

    double j2_north = -3.0 * J2 * g0 * (r_ratio * r_ratio) * std::sin(lat_rad_) * std::cos(lat_rad_);

    return {j2_north, 0.0, g_mag};
}

// ---------------------------------------------------------------------------
// Existing Coriolis+Centrifugal (unchanged)
// ---------------------------------------------------------------------------
Vec3 EarthModel::compute_coriolis_centrifugal_ned(const Vec3& r_ned, const Vec3& v_ned) const {
    Vec3 omega_e = {
        OMEGA_E * std::cos(lat_rad_),
        0.0,
        -OMEGA_E * std::sin(lat_rad_)
    };

    Vec3 coriolis = {
        -2.0 * (omega_e.y * v_ned.z - omega_e.z * v_ned.y),
        -2.0 * (omega_e.z * v_ned.x - omega_e.x * v_ned.z),
        -2.0 * (omega_e.x * v_ned.y - omega_e.y * v_ned.x)
    };

    Vec3 R_vec = { r_ned.x, r_ned.y, -RE + r_ned.z };

    Vec3 wxR = {
        omega_e.y * R_vec.z - omega_e.z * R_vec.y,
        omega_e.z * R_vec.x - omega_e.x * R_vec.z,
        omega_e.x * R_vec.y - omega_e.y * R_vec.x
    };

    Vec3 wx_wxR = {
        omega_e.y * wxR.z - omega_e.z * wxR.y,
        omega_e.z * wxR.x - omega_e.x * wxR.z,
        omega_e.x * wxR.y - omega_e.y * wxR.x
    };

    return {
        coriolis.x - wx_wxR.x,
        coriolis.y - wx_wxR.y,
        coriolis.z - wx_wxR.z
    };
}

// ===========================================================================
// ECEF Transformations
// ===========================================================================

// ---------------------------------------------------------------------------
// DCM from NED to ECEF at a given geodetic lat/lon
// Columns: [N̂, Ê, D̂] in ECEF
// ---------------------------------------------------------------------------
Matrix3x3 EarthModel::dcm_ned_to_ecef(double lat_rad, double lon_rad) const {
    double slat = std::sin(lat_rad);
    double clat = std::cos(lat_rad);
    double slon = std::sin(lon_rad);
    double clon = std::cos(lon_rad);

    // NED unit vectors expressed in ECEF:
    //  N̂ = [-slat*clon, -slat*slon,  clat]
    //  Ê = [-slon,       clon,        0   ]
    //  D̂ = [-clat*clon, -clat*slon, -slat]
    // DCM rows = ECEF axes, cols = NED axes
    return Matrix3x3(
        -slat * clon,  -slon,  -clat * clon,
        -slat * slon,   clon,  -clat * slon,
         clat,          0.0,   -slat
    );
}

// ---------------------------------------------------------------------------
// NED → ECEF: r_ecef = r_ecef_launch + DCM * r_ned
// ---------------------------------------------------------------------------
Vec3 EarthModel::ned_to_ecef(const Vec3& r_ned) const {
    const auto& D = dcm_ned2ecef_launch_;
    return {
        r_ecef_launch_.x + D.m[0][0]*r_ned.x + D.m[0][1]*r_ned.y + D.m[0][2]*r_ned.z,
        r_ecef_launch_.y + D.m[1][0]*r_ned.x + D.m[1][1]*r_ned.y + D.m[1][2]*r_ned.z,
        r_ecef_launch_.z + D.m[2][0]*r_ned.x + D.m[2][1]*r_ned.y + D.m[2][2]*r_ned.z
    };
}

// ---------------------------------------------------------------------------
// ECEF → NED: r_ned = DCM^T * (r_ecef - r_ecef_launch)
// ---------------------------------------------------------------------------
Vec3 EarthModel::ecef_to_ned(const Vec3& r_ecef) const {
    double dx = r_ecef.x - r_ecef_launch_.x;
    double dy = r_ecef.y - r_ecef_launch_.y;
    double dz = r_ecef.z - r_ecef_launch_.z;
    const auto& D = dcm_ned2ecef_launch_;
    // Transpose multiply: row i of result = column i of D dotted with delta
    return {
        D.m[0][0]*dx + D.m[1][0]*dy + D.m[2][0]*dz,
        D.m[0][1]*dx + D.m[1][1]*dy + D.m[2][1]*dz,
        D.m[0][2]*dx + D.m[1][2]*dy + D.m[2][2]*dz
    };
}

// ---------------------------------------------------------------------------
// ECEF → Geodetic LLA (Bowring's iterative method, ~2 iterations)
// ---------------------------------------------------------------------------
GeodeticLLA EarthModel::ecef_to_lla(const Vec3& r_ecef) const {
    double x = r_ecef.x;
    double y = r_ecef.y;
    double z = r_ecef.z;

    double p = std::sqrt(x * x + y * y);
    double lon = std::atan2(y, x);

    // Initial estimate using Bowring's formula
    double b = RE * (1.0 - F);  // Polar semi-axis
    double ep2 = (RE * RE - b * b) / (b * b); // e'^2
    double theta = std::atan2(z * RE, p * b);

    double sin_theta = std::sin(theta);
    double cos_theta = std::cos(theta);

    double lat = std::atan2(
        z + ep2 * b * sin_theta * sin_theta * sin_theta,
        p - E2 * RE * cos_theta * cos_theta * cos_theta
    );

    // One refinement iteration for better accuracy
    double sin_lat = std::sin(lat);
    double cos_lat = std::cos(lat);
    double N = prime_vertical_radius(sin_lat);
    double alt = (cos_lat > 1e-10) ? (p / cos_lat - N) : (std::abs(z) / sin_lat - N * (1.0 - E2));

    return {lat, lon, alt};
}

// ---------------------------------------------------------------------------
// Gravity in ECEF frame via J2 model at actual ECEF position
// Uses the standard J2 gravitational acceleration in ECEF coordinates
// ---------------------------------------------------------------------------
Vec3 EarthModel::compute_gravity_ecef(const Vec3& r_ecef) const {
    double x = r_ecef.x;
    double y = r_ecef.y;
    double z = r_ecef.z;
    double r2 = x*x + y*y + z*z;
    double r = std::sqrt(r2);
    if (r < 1.0) return {0.0, 0.0, 0.0}; // Degenerate

    double r5 = r2 * r2 * r;
    double re2 = RE * RE;

    // J2 gravitational acceleration in ECEF
    // a_x = -MU*x/r^3 * [1 - 1.5*J2*(RE/r)^2*(5*z^2/r^2 - 1)]
    // a_y = -MU*y/r^3 * [same]
    // a_z = -MU*z/r^3 * [1 - 1.5*J2*(RE/r)^2*(5*z^2/r^2 - 3)]
    double r3 = r2 * r;
    double j2_common = 1.5 * J2 * re2 / r2;
    double z2_r2 = (z * z) / r2;

    double fxy = -MU / r3 * (1.0 - j2_common * (5.0 * z2_r2 - 1.0));
    double fz  = -MU / r3 * (1.0 - j2_common * (5.0 * z2_r2 - 3.0));

    return {fxy * x, fxy * y, fz * z};
}

} // namespace gnc::sim
