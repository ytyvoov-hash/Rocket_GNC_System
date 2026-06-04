#pragma once
#include "gnc-core/types.h"

namespace gnc::sim {

struct EarthModelParams {
    double launch_latitude_deg = 0.0;
    double launch_longitude_deg = 0.0;
};

struct GeodeticLLA {
    double lat_rad;
    double lon_rad;
    double alt_m;
};

class EarthModel {
public:
    EarthModel(const EarthModelParams& params = {});

    // Compute gravity vector in NED frame including J2 perturbations and altitude attenuation
    // r_ned is position in NED relative to launch point
    Vec3 compute_gravity_ned(const Vec3& r_ned) const;

    // Compute Rotating Earth forces (Coriolis + Centrifugal) in NED frame
    Vec3 compute_coriolis_centrifugal_ned(const Vec3& r_ned, const Vec3& v_ned) const;

    // ---------- ECEF Transformations ----------

    // Convert launch-relative NED position to ECEF
    Vec3 ned_to_ecef(const Vec3& r_ned) const;

    // Convert ECEF position back to NED relative to launch
    Vec3 ecef_to_ned(const Vec3& r_ecef) const;

    // Get geodetic latitude/longitude/altitude from ECEF position
    GeodeticLLA ecef_to_lla(const Vec3& r_ecef) const;

    // Compute gravity in ECEF frame using J2 model at actual position
    Vec3 compute_gravity_ecef(const Vec3& r_ecef) const;

    // Compute the NED-to-ECEF rotation matrix at a given lat/lon
    Matrix3x3 dcm_ned_to_ecef(double lat_rad, double lon_rad) const;

    // Accessors
    double launch_lat_rad() const { return lat_rad_; }
    double launch_lon_rad() const { return lon_rad_; }
    const Vec3& launch_ecef() const { return r_ecef_launch_; }

private:
    double lat_rad_;
    double lon_rad_;

    // Cached launch-site ECEF position and DCM
    Vec3 r_ecef_launch_{};
    Matrix3x3 dcm_ned2ecef_launch_{};

    // WGS84 constants
    static constexpr double RE = 6378137.0;         // Equatorial radius (m)
    static constexpr double F  = 1.0 / 298.257223563; // Flattening
    static constexpr double E2 = 2.0 * F - F * F;   // Eccentricity squared
    static constexpr double J2 = 1.08263e-3;
    static constexpr double MU = 3.986004418e14;     // GM (m^3/s^2)
    static constexpr double OMEGA_E = 7.292115e-5;   // Earth rotation rate (rad/s)

    // Compute WGS84 prime vertical radius of curvature
    static double prime_vertical_radius(double sin_lat);
};

} // namespace gnc::sim
