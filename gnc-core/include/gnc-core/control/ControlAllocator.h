#pragma once

#include "IControlAllocator.h"
#include <array>

namespace gnc::control {

// ---------------------------------------------------------------------------
// Template-driven fin geometry.
//
// Each control surface i contributes, per radian of deflection, a body moment
//     dM_i = q * S_ref * L_ref * eff[i]
// where eff[i] = {Cl_i, Cm_i, Cn_i} are its (roll, pitch, yaw) effectiveness
// coefficients. Stacking the active columns gives the 3xN effectiveness
// matrix B; allocation solves B * delta = m for the deflection vector.
//
// Sign convention encodes mounting: a canard (forward of the CG) has its
// pitch/yaw effectiveness negated relative to an aft tail fin, so a positive
// pitch demand commands the opposite physical deflection. This falls out of
// the matrix solve automatically — no special-casing in allocate().
//
// Coefficients default to the legacy generic values (Cl=0.01, Cm=Cn=0.05) so
// the canonical 4-fin vehicle is unchanged; a template supplies real values
// (per-Mach lookup wiring is P3.2).
// ---------------------------------------------------------------------------
struct FinGeometry {
    int n_fins{4};
    std::array<Vec3, kMaxFins> eff{};              // {Cl_i, Cm_i, Cn_i} per fin
    std::array<double, kMaxFins> delta_max_rad{};  // per-fin position limit (rad)

    // Canonical 4-fin cruciform "+" (two pitch, two yaw fins; roll from all).
    static FinGeometry cruciform4(double Cl = 0.01, double Cm = 0.05,
                                  double Cn = 0.05, double delta_max = 0.35);

    // n fins evenly spaced around the roll axis (over-actuated for n>3, e.g.
    // GH n=8, SA n=12). All fins share roll authority; pitch/yaw projected
    // onto the fin azimuth.
    static FinGeometry ring(int n, double k_roll = 0.02, double k_pitch_yaw = 0.06,
                            double delta_max = 0.35);

    // 4-fin canard pack (forward of CG): pitch/yaw effectiveness sign-inverted.
    static FinGeometry canard4(double Cl = 0.01, double Cm = 0.05,
                               double Cn = 0.05, double delta_max = 0.35);
};

// Maps a desired body moment to fin deflections via the (weighted) minimum-norm
// least-squares solution of the fin effectiveness matrix. Supports any fin
// count up to kMaxFins, including over-actuated ring layouts and canards.
class FinAllocator : public IControlAllocator {
public:
    FinAllocator() : geom_(FinGeometry::cruciform4()) {}
    explicit FinAllocator(const FinGeometry& geom) : geom_(geom) {}

    ActuatorCommands allocate(const ControlEffort& effort, const AllocatorState& state) override;

    const FinGeometry& geometry() const { return geom_; }

private:
    FinGeometry geom_;
};

class TVCAllocator : public IControlAllocator {
public:
    ActuatorCommands allocate(const ControlEffort& effort, const AllocatorState& state) override;
};

} // namespace gnc::control
