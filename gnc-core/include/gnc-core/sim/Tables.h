#pragma once

#include <string>
#include <vector>
#include <array>
#include <tuple>
#include <map>

namespace gnc {
namespace sim {

struct AtmosphereData {
    double altitude_m;
    double pressure_Pa;
    double temperature_K;
    double density_kg_m3;
    double speed_of_sound_m_s;
    double wind_north_m_s;
    double wind_east_m_s;
    double wind_down_m_s;
};

struct ThrustData {
    double time_s;
    double thrust_N;
    double mass_flow_kg_s;
};

struct AeroData {
    double mach;
    double alpha_deg;
    double Cd;
    double Cn;
    double Cm;
};

class AtmosphereTable {
public:
    void loadFromCsv(const std::string& path);
    AtmosphereData lookup(double altitude) const;
    bool isLoaded() const { return !table_.empty(); }
private:
    std::vector<AtmosphereData> table_;
};

class ThrustCurve {
public:
    void loadFromCsv(const std::string& path);
    ThrustData lookup(double time) const;
    bool isLoaded() const { return !table_.empty(); }
    double computeCumulativeMassLoss(double time) const;
private:
    std::vector<ThrustData> table_;
};

class AeroCoeffs {
public:
    void loadFromCsv(const std::string& path);
    AeroData lookup(double mach, double alpha_deg) const;
    bool isLoaded() const { return !table_.empty(); }
private:
    std::vector<AeroData> table_;
};

// Damping derivatives: Cmq (pitch damping), Cnq (yaw damping), Clp (roll damping)
struct DampingData {
    double mach;
    double alpha_deg;
    double Cmq;   // Pitch damping moment derivative (per rad/s)
    double Cnq;   // Yaw damping moment derivative
    double Clp;   // Roll damping moment derivative
};

class DampingCoeffs {
public:
    void loadFromCsv(const std::string& path);
    DampingData lookup(double mach, double alpha_deg) const;
    bool isLoaded() const { return !table_.empty(); }
private:
    std::vector<DampingData> table_;
};

// Fin deflection effectiveness: Cnd (normal force per delta), Cmd (moment per delta)
struct FinDeflectionData {
    double mach;
    double delta_deg;
    double Cnd;   // Normal force coefficient increment per fin deflection
    double Cmd;   // Moment coefficient increment per fin deflection
};

class FinDeflectionCoeffs {
public:
    void loadFromCsv(const std::string& path);
    FinDeflectionData lookup(double mach, double delta_deg) const;
    bool isLoaded() const { return !table_.empty(); }
private:
    std::vector<FinDeflectionData> table_;
};

// Roll aero coupling: Cll (roll moment from alpha + fin deflection)
struct RollAeroData {
    double mach;
    double alpha_deg;
    double def_roll_deg;
    double Cll;   // Roll moment coefficient
};

class RollAeroCoeffs {
public:
    void loadFromCsv(const std::string& path);
    RollAeroData lookup(double mach, double alpha_deg, double def_roll_deg) const;
    bool isLoaded() const { return !table_.empty(); }
private:
    std::vector<RollAeroData> table_;
};

} // namespace sim
} // namespace gnc
