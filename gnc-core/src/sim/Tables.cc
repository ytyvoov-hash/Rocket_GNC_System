#include "gnc-core/sim/Tables.h"
#include <fstream>
#include <sstream>
#include <iostream>
#include <algorithm>
#include <cmath>

namespace gnc {
namespace sim {

namespace {

// Helper to interpolate between two values
double lerp(double x, double x0, double x1, double y0, double y1) {
    if (x0 == x1) return y0;
    return y0 + (x - x0) * (y1 - y0) / (x1 - x0);
}

// Simple split by comma
std::vector<std::string> splitCsv(const std::string& line) {
    std::vector<std::string> result;
    std::stringstream ss(line);
    std::string item;
    while (std::getline(ss, item, ',')) {
        result.push_back(item);
    }
    return result;
}

} // namespace

void AtmosphereTable::loadFromCsv(const std::string& path) {
    table_.clear();
    std::ifstream file(path);
    if (!file.is_open()) return;

    std::string line;
    // Skip header
    std::getline(file, line);
    while (std::getline(file, line)) {
        if (line.empty()) continue;
        auto tokens = splitCsv(line);
        if (tokens.size() >= 8) {
            AtmosphereData d;
            d.altitude_m = std::stod(tokens[0]);
            d.pressure_Pa = std::stod(tokens[1]);
            d.temperature_K = std::stod(tokens[2]);
            d.density_kg_m3 = std::stod(tokens[3]);
            d.speed_of_sound_m_s = std::stod(tokens[4]);
            d.wind_north_m_s = std::stod(tokens[5]);
            d.wind_east_m_s = std::stod(tokens[6]);
            d.wind_down_m_s = std::stod(tokens[7]);
            table_.push_back(d);
        }
    }
}

AtmosphereData AtmosphereTable::lookup(double altitude) const {
    if (table_.empty()) {
        return {altitude, 101325.0, 288.15, 1.225, 340.29, 0, 0, 0}; // Default sea level
    }

    if (altitude <= table_.front().altitude_m) return table_.front();
    if (altitude >= table_.back().altitude_m) return table_.back();

    // Binary search
    auto it = std::lower_bound(table_.begin(), table_.end(), altitude,
        [](const AtmosphereData& a, double alt) { return a.altitude_m < alt; });

    if (it == table_.end()) return table_.back();
    if (it == table_.begin()) return table_.front();

    auto it_prev = it - 1;
    double t = (altitude - it_prev->altitude_m) / (it->altitude_m - it_prev->altitude_m);

    AtmosphereData res;
    res.altitude_m = altitude;
    res.pressure_Pa = lerp(altitude, it_prev->altitude_m, it->altitude_m, it_prev->pressure_Pa, it->pressure_Pa);
    res.temperature_K = lerp(altitude, it_prev->altitude_m, it->altitude_m, it_prev->temperature_K, it->temperature_K);
    res.density_kg_m3 = lerp(altitude, it_prev->altitude_m, it->altitude_m, it_prev->density_kg_m3, it->density_kg_m3);
    res.speed_of_sound_m_s = lerp(altitude, it_prev->altitude_m, it->altitude_m, it_prev->speed_of_sound_m_s, it->speed_of_sound_m_s);
    res.wind_north_m_s = lerp(altitude, it_prev->altitude_m, it->altitude_m, it_prev->wind_north_m_s, it->wind_north_m_s);
    res.wind_east_m_s = lerp(altitude, it_prev->altitude_m, it->altitude_m, it_prev->wind_east_m_s, it->wind_east_m_s);
    res.wind_down_m_s = lerp(altitude, it_prev->altitude_m, it->altitude_m, it_prev->wind_down_m_s, it->wind_down_m_s);

    return res;
}

void ThrustCurve::loadFromCsv(const std::string& path) {
    table_.clear();
    std::ifstream file(path);
    if (!file.is_open()) return;

    std::string line;
    std::getline(file, line); // Skip header
    while (std::getline(file, line)) {
        if (line.empty()) continue;
        auto tokens = splitCsv(line);
        if (tokens.size() >= 3) {
            ThrustData d;
            d.time_s = std::stod(tokens[0]);
            d.thrust_N = std::stod(tokens[1]);
            d.mass_flow_kg_s = std::stod(tokens[2]);
            table_.push_back(d);
        }
    }
}

ThrustData ThrustCurve::lookup(double time) const {
    if (table_.empty()) {
        return {time, 0.0, 0.0};
    }
    if (time <= table_.front().time_s) return table_.front();
    if (time >= table_.back().time_s) return {time, 0.0, 0.0}; // Engine burnout

    auto it = std::lower_bound(table_.begin(), table_.end(), time,
        [](const ThrustData& a, double t) { return a.time_s < t; });

    if (it == table_.end()) return {time, 0.0, 0.0};
    if (it == table_.begin()) return table_.front();

    auto it_prev = it - 1;

    ThrustData res;
    res.time_s = time;
    res.thrust_N = lerp(time, it_prev->time_s, it->time_s, it_prev->thrust_N, it->thrust_N);
    res.mass_flow_kg_s = lerp(time, it_prev->time_s, it->time_s, it_prev->mass_flow_kg_s, it->mass_flow_kg_s);

    return res;
}

double ThrustCurve::computeCumulativeMassLoss(double time) const {
    if (table_.empty()) return 0.0;
    if (time <= 0.0) return 0.0;
    if (time >= table_.back().time_s) {
        // Integrate to end of table
        time = table_.back().time_s;
    }

    double mass_lost = 0.0;
    double prev_time = 0.0;
    double prev_flow = table_.front().mass_flow_kg_s;

    for (const auto& entry : table_) {
        if (entry.time_s > time) break;
        double dt = entry.time_s - prev_time;
        double avg_flow = (prev_flow + entry.mass_flow_kg_s) / 2.0;
        mass_lost += avg_flow * dt;
        prev_time = entry.time_s;
        prev_flow = entry.mass_flow_kg_s;
    }

    // Handle partial interval if time is between table entries
    if (time > prev_time) {
        double dt = time - prev_time;
        double current_flow = lookup(time).mass_flow_kg_s;
        double avg_flow = (prev_flow + current_flow) / 2.0;
        mass_lost += avg_flow * dt;
    }

    return mass_lost;
}

void AeroCoeffs::loadFromCsv(const std::string& path) {
    table_.clear();
    std::ifstream file(path);
    if (!file.is_open()) return;

    std::string line;
    std::getline(file, line); // Skip header
    while (std::getline(file, line)) {
        if (line.empty()) continue;
        auto tokens = splitCsv(line);
        if (tokens.size() == 4) {
              AeroData d;
              d.mach = std::stod(tokens[0]);
              d.alpha_deg = std::stod(tokens[1]);
              d.Cd = std::stod(tokens[3]); // CA is at index 3
              d.Cn = 0.0;
              d.Cm = 0.0;
              table_.push_back(d);
          } else if (tokens.size() >= 5) {
              AeroData d;
              d.mach = std::stod(tokens[0]);
              d.alpha_deg = std::stod(tokens[1]);
              d.Cd = std::stod(tokens[2]);
              d.Cn = std::stod(tokens[3]);
              d.Cm = std::stod(tokens[4]);
              table_.push_back(d);
          }
    }

    // Sort by Mach, then by alpha
    std::sort(table_.begin(), table_.end(), [](const AeroData& a, const AeroData& b) {
        if (a.mach != b.mach) return a.mach < b.mach;
        return a.alpha_deg < b.alpha_deg;
    });
}

AeroData AeroCoeffs::lookup(double mach, double alpha_deg) const {
    if (table_.empty()) {
        return {mach, alpha_deg, 0.4, 0.0, 0.0}; // Fallback
    }

    // Bilinear interpolation strategy
    // 1. Find the 4 nearest points: (M0, a0), (M1, a0), (M0, a1), (M1, a1)
    
    // Find unique machs
    std::vector<double> machs;
    for (const auto& d : table_) {
        if (machs.empty() || machs.back() != d.mach) {
            machs.push_back(d.mach);
        }
    }

    double m0 = machs.front(), m1 = machs.back();
    for (size_t i = 0; i < machs.size() - 1; ++i) {
        if (mach >= machs[i] && mach <= machs[i+1]) {
            m0 = machs[i];
            m1 = machs[i+1];
            break;
        }
    }
    if (mach < machs.front()) m1 = m0;
    if (mach > machs.back()) m0 = m1;

    // Helper to get aero data for a specific Mach and interpolate alpha
    auto getForMach = [&](double target_m) {
        std::vector<AeroData> slice;
        for (const auto& d : table_) {
            if (d.mach == target_m) slice.push_back(d);
        }
        if (slice.empty()) return AeroData{target_m, alpha_deg, 0.0, 0.0, 0.0};

        if (alpha_deg <= slice.front().alpha_deg) return slice.front();
        if (alpha_deg >= slice.back().alpha_deg) return slice.back();

        auto it = std::lower_bound(slice.begin(), slice.end(), alpha_deg,
            [](const AeroData& a, double val) { return a.alpha_deg < val; });
            
        if (it == slice.end()) return slice.back();
        if (it == slice.begin()) return slice.front();

        auto it_prev = it - 1;
        AeroData res;
        res.mach = target_m;
        res.alpha_deg = alpha_deg;
        res.Cd = lerp(alpha_deg, it_prev->alpha_deg, it->alpha_deg, it_prev->Cd, it->Cd);
        res.Cn = lerp(alpha_deg, it_prev->alpha_deg, it->alpha_deg, it_prev->Cn, it->Cn);
        res.Cm = lerp(alpha_deg, it_prev->alpha_deg, it->alpha_deg, it_prev->Cm, it->Cm);
        return res;
    };

    AeroData d0 = getForMach(m0);
    AeroData d1 = getForMach(m1);

    if (m0 == m1) return d0;

    AeroData res;
    res.mach = mach;
    res.alpha_deg = alpha_deg;
    res.Cd = lerp(mach, m0, m1, d0.Cd, d1.Cd);
    res.Cn = lerp(mach, m0, m1, d0.Cn, d1.Cn);
    res.Cm = lerp(mach, m0, m1, d0.Cm, d1.Cm);
    return res;
}

void DampingCoeffs::loadFromCsv(const std::string& path) {
    table_.clear();
    std::ifstream file(path);
    if (!file.is_open()) return;

    std::string line;
    std::getline(file, line); // Skip header
    while (std::getline(file, line)) {
        if (line.empty()) continue;
        auto tokens = splitCsv(line);
        if (tokens.size() >= 5) {
            DampingData d;
            d.mach = std::stod(tokens[0]);
            d.alpha_deg = std::stod(tokens[1]);
            d.Cmq = std::stod(tokens[2]);
            d.Cnq = std::stod(tokens[3]);
            d.Clp = std::stod(tokens[4]);
            table_.push_back(d);
        }
    }
    std::sort(table_.begin(), table_.end(), [](const DampingData& a, const DampingData& b) {
        if (a.mach != b.mach) return a.mach < b.mach;
        return a.alpha_deg < b.alpha_deg;
    });
}

DampingData DampingCoeffs::lookup(double mach, double alpha_deg) const {
    if (table_.empty()) return {mach, alpha_deg, 0.0, 0.0, 0.0};
    
    std::vector<double> machs;
    for (const auto& d : table_) {
        if (machs.empty() || machs.back() != d.mach) machs.push_back(d.mach);
    }
    double m0 = machs.front(), m1 = machs.back();
    for (size_t i = 0; i < machs.size() - 1; ++i) {
        if (mach >= machs[i] && mach <= machs[i+1]) {
            m0 = machs[i];
            m1 = machs[i+1];
            break;
        }
    }
    if (mach < machs.front()) m1 = m0;
    if (mach > machs.back()) m0 = m1;

    auto getForMach = [&](double target_m) {
        std::vector<DampingData> slice;
        for (const auto& d : table_) if (d.mach == target_m) slice.push_back(d);
        if (slice.empty()) return DampingData{target_m, alpha_deg, 0.0, 0.0, 0.0};
        if (alpha_deg <= slice.front().alpha_deg) return slice.front();
        if (alpha_deg >= slice.back().alpha_deg) return slice.back();
        auto it = std::lower_bound(slice.begin(), slice.end(), alpha_deg,
            [](const DampingData& a, double val) { return a.alpha_deg < val; });
        if (it == slice.end()) return slice.back();
        if (it == slice.begin()) return slice.front();
        auto it_prev = it - 1;
        DampingData res;
        res.mach = target_m;
        res.alpha_deg = alpha_deg;
        res.Cmq = lerp(alpha_deg, it_prev->alpha_deg, it->alpha_deg, it_prev->Cmq, it->Cmq);
        res.Cnq = lerp(alpha_deg, it_prev->alpha_deg, it->alpha_deg, it_prev->Cnq, it->Cnq);
        res.Clp = lerp(alpha_deg, it_prev->alpha_deg, it->alpha_deg, it_prev->Clp, it->Clp);
        return res;
    };

    DampingData d0 = getForMach(m0);
    DampingData d1 = getForMach(m1);
    if (m0 == m1) return d0;
    DampingData res;
    res.mach = mach;
    res.alpha_deg = alpha_deg;
    res.Cmq = lerp(mach, m0, m1, d0.Cmq, d1.Cmq);
    res.Cnq = lerp(mach, m0, m1, d0.Cnq, d1.Cnq);
    res.Clp = lerp(mach, m0, m1, d0.Clp, d1.Clp);
    return res;
}

void FinDeflectionCoeffs::loadFromCsv(const std::string& path) {
    table_.clear();
    std::ifstream file(path);
    if (!file.is_open()) return;

    std::string line;
    std::getline(file, line); // Skip header
    while (std::getline(file, line)) {
        if (line.empty()) continue;
        auto tokens = splitCsv(line);
        if (tokens.size() >= 4) {
            FinDeflectionData d;
            d.mach = std::stod(tokens[0]);
            d.delta_deg = std::stod(tokens[1]);
            d.Cnd = std::stod(tokens[2]);
            d.Cmd = std::stod(tokens[3]);
            table_.push_back(d);
        }
    }
    std::sort(table_.begin(), table_.end(), [](const FinDeflectionData& a, const FinDeflectionData& b) {
        if (a.mach != b.mach) return a.mach < b.mach;
        return a.delta_deg < b.delta_deg;
    });
}

FinDeflectionData FinDeflectionCoeffs::lookup(double mach, double delta_deg) const {
    if (table_.empty()) return {mach, delta_deg, 0.0, 0.0};
    
    std::vector<double> machs;
    for (const auto& d : table_) {
        if (machs.empty() || machs.back() != d.mach) machs.push_back(d.mach);
    }
    double m0 = machs.front(), m1 = machs.back();
    for (size_t i = 0; i < machs.size() - 1; ++i) {
        if (mach >= machs[i] && mach <= machs[i+1]) {
            m0 = machs[i];
            m1 = machs[i+1];
            break;
        }
    }
    if (mach < machs.front()) m1 = m0;
    if (mach > machs.back()) m0 = m1;

    auto getForMach = [&](double target_m) {
        std::vector<FinDeflectionData> slice;
        for (const auto& d : table_) if (d.mach == target_m) slice.push_back(d);
        if (slice.empty()) return FinDeflectionData{target_m, delta_deg, 0.0, 0.0};
        if (delta_deg <= slice.front().delta_deg) return slice.front();
        if (delta_deg >= slice.back().delta_deg) return slice.back();
        auto it = std::lower_bound(slice.begin(), slice.end(), delta_deg,
            [](const FinDeflectionData& a, double val) { return a.delta_deg < val; });
        if (it == slice.end()) return slice.back();
        if (it == slice.begin()) return slice.front();
        auto it_prev = it - 1;
        FinDeflectionData res;
        res.mach = target_m;
        res.delta_deg = delta_deg;
        res.Cnd = lerp(delta_deg, it_prev->delta_deg, it->delta_deg, it_prev->Cnd, it->Cnd);
        res.Cmd = lerp(delta_deg, it_prev->delta_deg, it->delta_deg, it_prev->Cmd, it->Cmd);
        return res;
    };

    FinDeflectionData d0 = getForMach(m0);
    FinDeflectionData d1 = getForMach(m1);
    if (m0 == m1) return d0;
    FinDeflectionData res;
    res.mach = mach;
    res.delta_deg = delta_deg;
    res.Cnd = lerp(mach, m0, m1, d0.Cnd, d1.Cnd);
    res.Cmd = lerp(mach, m0, m1, d0.Cmd, d1.Cmd);
    return res;
}

void RollAeroCoeffs::loadFromCsv(const std::string& path) {
    table_.clear();
    std::ifstream file(path);
    if (!file.is_open()) return;

    std::string line;
    std::getline(file, line); // Skip header
    while (std::getline(file, line)) {
        if (line.empty()) continue;
        auto tokens = splitCsv(line);
        if (tokens.size() >= 4) {
            RollAeroData d;
            d.mach = std::stod(tokens[0]);
            d.alpha_deg = std::stod(tokens[1]);
            d.def_roll_deg = std::stod(tokens[2]);
            d.Cll = std::stod(tokens[3]);
            table_.push_back(d);
        }
    }
    std::sort(table_.begin(), table_.end(), [](const RollAeroData& a, const RollAeroData& b) {
        if (a.mach != b.mach) return a.mach < b.mach;
        if (a.alpha_deg != b.alpha_deg) return a.alpha_deg < b.alpha_deg;
        return a.def_roll_deg < b.def_roll_deg;
    });
}

RollAeroData RollAeroCoeffs::lookup(double mach, double alpha_deg, double def_roll_deg) const {
    if (table_.empty()) return {mach, alpha_deg, def_roll_deg, 0.0};
    
    std::vector<double> machs;
    for (const auto& d : table_) {
        if (machs.empty() || machs.back() != d.mach) machs.push_back(d.mach);
    }
    double m0 = machs.front(), m1 = machs.back();
    for (size_t i = 0; i < machs.size() - 1; ++i) {
        if (mach >= machs[i] && mach <= machs[i+1]) {
            m0 = machs[i];
            m1 = machs[i+1];
            break;
        }
    }
    if (mach < machs.front()) m1 = m0;
    if (mach > machs.back()) m0 = m1;

    // We do a simplified 3D lookup: first find mach slice, then find alpha slice, then interpolate def_roll
    // For full accuracy this should be trilinear, but we'll do bilinear on mach and alpha, nearest on def_roll (or linear)
    auto getForMachAndAlpha = [&](double target_m, double target_a) {
        std::vector<RollAeroData> slice;
        for (const auto& d : table_) {
            if (d.mach == target_m && d.alpha_deg == target_a) slice.push_back(d);
        }
        if (slice.empty()) {
            // fallback: find nearest alpha for this mach
            std::vector<double> alphas;
            for (const auto& d : table_) {
                if (d.mach == target_m && (alphas.empty() || alphas.back() != d.alpha_deg)) alphas.push_back(d.alpha_deg);
            }
            if (alphas.empty()) return RollAeroData{target_m, target_a, def_roll_deg, 0.0};
            
            double a0 = alphas.front(), a1 = alphas.back();
            for (size_t i = 0; i < alphas.size() - 1; ++i) {
                if (target_a >= alphas[i] && target_a <= alphas[i+1]) {
                    a0 = alphas[i]; a1 = alphas[i+1]; break;
                }
            }
            if (target_a < alphas.front()) a1 = a0;
            if (target_a > alphas.back()) a0 = a1;

            auto getForMachAlphaDef = [&](double tm, double ta) {
                std::vector<RollAeroData> def_slice;
                for (const auto& d : table_) if (d.mach == tm && d.alpha_deg == ta) def_slice.push_back(d);
                if (def_slice.empty()) return RollAeroData{tm, ta, def_roll_deg, 0.0};
                if (def_roll_deg <= def_slice.front().def_roll_deg) return def_slice.front();
                if (def_roll_deg >= def_slice.back().def_roll_deg) return def_slice.back();
                auto it = std::lower_bound(def_slice.begin(), def_slice.end(), def_roll_deg,
                    [](const RollAeroData& a, double val) { return a.def_roll_deg < val; });
                if (it == def_slice.end()) return def_slice.back();
                if (it == def_slice.begin()) return def_slice.front();
                auto it_prev = it - 1;
                RollAeroData res;
                res.mach = tm; res.alpha_deg = ta; res.def_roll_deg = def_roll_deg;
                res.Cll = lerp(def_roll_deg, it_prev->def_roll_deg, it->def_roll_deg, it_prev->Cll, it->Cll);
                return res;
            };

            RollAeroData ra0 = getForMachAlphaDef(target_m, a0);
            RollAeroData ra1 = getForMachAlphaDef(target_m, a1);
            if (a0 == a1) return ra0;
            RollAeroData rres;
            rres.mach = target_m; rres.alpha_deg = target_a; rres.def_roll_deg = def_roll_deg;
            rres.Cll = lerp(target_a, a0, a1, ra0.Cll, ra1.Cll);
            return rres;
        }

        // Exact mach and alpha found
        if (def_roll_deg <= slice.front().def_roll_deg) return slice.front();
        if (def_roll_deg >= slice.back().def_roll_deg) return slice.back();
        auto it = std::lower_bound(slice.begin(), slice.end(), def_roll_deg,
            [](const RollAeroData& a, double val) { return a.def_roll_deg < val; });
        if (it == slice.end()) return slice.back();
        if (it == slice.begin()) return slice.front();
        auto it_prev = it - 1;
        RollAeroData res;
        res.mach = target_m; res.alpha_deg = target_a; res.def_roll_deg = def_roll_deg;
        res.Cll = lerp(def_roll_deg, it_prev->def_roll_deg, it->def_roll_deg, it_prev->Cll, it->Cll);
        return res;
    };

    RollAeroData d0 = getForMachAndAlpha(m0, alpha_deg);
    RollAeroData d1 = getForMachAndAlpha(m1, alpha_deg);
    if (m0 == m1) return d0;
    RollAeroData res;
    res.mach = mach; res.alpha_deg = alpha_deg; res.def_roll_deg = def_roll_deg;
    res.Cll = lerp(mach, m0, m1, d0.Cll, d1.Cll);
    return res;
}

} // namespace sim
} // namespace gnc
