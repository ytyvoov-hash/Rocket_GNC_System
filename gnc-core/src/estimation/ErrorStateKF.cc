// gnc-core/estimation/ErrorStateKF.cc  — see ErrorStateKF.h.

#include "gnc-core/estimation/ErrorStateKF.h"

#include <Eigen/Dense>

#include <cmath>

namespace gnc::estimation {

namespace {

using Mat15 = Eigen::Matrix<double, 15, 15>;
using Vec15 = Eigen::Matrix<double, 15, 1>;

Eigen::Vector3d to_eig(const Vec3& v) { return {v.x, v.y, v.z}; }
Vec3 from_eig(const Eigen::Vector3d& v) { return {v(0), v(1), v(2)}; }

// Rotation matrix body→NED from a Hamiltonian quaternion q_b_n.
Eigen::Matrix3d rot_from_quat(const Quat& q)
{
    Eigen::Quaterniond e(q.w, q.x, q.y, q.z);
    e.normalize();
    return e.toRotationMatrix();
}

Eigen::Matrix3d skew(const Eigen::Vector3d& v)
{
    Eigen::Matrix3d S;
    S <<     0, -v(2),  v(1),
          v(2),     0, -v(0),
         -v(1),  v(0),     0;
    return S;
}

// Quaternion (Hamiltonian) from a small rotation vector (body frame).
Quat quat_from_rotvec(const Eigen::Vector3d& dtheta)
{
    const double angle = dtheta.norm();
    if (angle < 1e-12) return Quat{1.0, 0.0, 0.0, 0.0};
    const Eigen::Vector3d axis = dtheta / angle;
    const double s = std::sin(angle * 0.5);
    return Quat{std::cos(angle * 0.5), axis(0) * s, axis(1) * s, axis(2) * s};
}

Quat quat_mul(const Quat& a, const Quat& b)
{
    return Quat{
        a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
        a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w};
}

Quat quat_normalize(const Quat& q)
{
    const double n = std::sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z);
    if (n < 1e-12) return Quat{1, 0, 0, 0};
    return Quat{q.w / n, q.x / n, q.y / n, q.z / n};
}

void load_P(const double src[15][15], Mat15& P)
{
    for (int i = 0; i < 15; ++i)
        for (int j = 0; j < 15; ++j) P(i, j) = src[i][j];
}
void store_P(const Mat15& P, double dst[15][15])
{
    for (int i = 0; i < 15; ++i)
        for (int j = 0; j < 15; ++j) dst[i][j] = P(i, j);
}

}  // namespace

void ErrorStateKF::initialize(const Vec3& p0_n, const Vec3& v0_n,
                              const Quat& q0_b_n, const EskfParams& params)
{
    prm_   = params;
    p_n_   = p0_n;
    v_n_   = v0_n;
    q_b_n_ = quat_normalize(q0_b_n);
    ba_b_  = Vec3{};
    bg_b_  = Vec3{};

    Mat15 P = Mat15::Zero();
    const double vp = prm_.init_pos_std * prm_.init_pos_std;
    const double vv = prm_.init_vel_std * prm_.init_vel_std;
    const double va = prm_.init_att_std * prm_.init_att_std;
    const double vba = prm_.init_ba_std * prm_.init_ba_std;
    const double vbg = prm_.init_bg_std * prm_.init_bg_std;
    for (int i = 0; i < 3; ++i) {
        P(i, i)         = vp;
        P(3 + i, 3 + i) = vv;
        P(6 + i, 6 + i) = va;
        P(9 + i, 9 + i) = vba;
        P(12 + i, 12 + i) = vbg;
    }
    store_P(P, P_);

    initialized_ = true;
    diverged_    = false;
}

void ErrorStateKF::predict(const Vec3& accel_meas_b, const Vec3& gyro_meas_b,
                           double dt)
{
    if (!initialized_ || diverged_ || dt <= 0.0) return;

    const Eigen::Matrix3d R = rot_from_quat(q_b_n_);
    const Eigen::Vector3d a_b = to_eig(accel_meas_b) - to_eig(ba_b_);   // specific force
    const Eigen::Vector3d w_b = to_eig(gyro_meas_b) - to_eig(bg_b_);    // body rate
    const Eigen::Vector3d g_n = to_eig(prm_.gravity_n);
    const Eigen::Vector3d a_n = R * a_b + g_n;                          // inertial accel (NED)

    // --- Nominal propagation ---
    const Eigen::Vector3d p = to_eig(p_n_);
    const Eigen::Vector3d v = to_eig(v_n_);
    p_n_ = from_eig(p + v * dt + 0.5 * a_n * dt * dt);
    v_n_ = from_eig(v + a_n * dt);
    q_b_n_ = quat_normalize(quat_mul(q_b_n_, quat_from_rotvec(w_b * dt)));
    // biases: random-walk, mean unchanged.

    // --- Error-state transition F = I + A·dt ---
    Mat15 A = Mat15::Zero();
    A.block<3, 3>(0, 3)  = Eigen::Matrix3d::Identity();          // δp ← δv
    A.block<3, 3>(3, 6)  = -R * skew(a_b);                       // δv ← δθ
    A.block<3, 3>(3, 9)  = -R;                                   // δv ← δb_a
    A.block<3, 3>(6, 6)  = -skew(w_b);                           // δθ ← δθ
    A.block<3, 3>(6, 12) = -Eigen::Matrix3d::Identity();         // δθ ← δb_g
    const Mat15 F = Mat15::Identity() + A * dt;

    // Discrete process noise (diagonal approximation).
    Mat15 Q = Mat15::Zero();
    const double qa  = prm_.sigma_a  * prm_.sigma_a  * dt;
    const double qg  = prm_.sigma_g  * prm_.sigma_g  * dt;
    const double qba = prm_.sigma_ba * prm_.sigma_ba * dt;
    const double qbg = prm_.sigma_bg * prm_.sigma_bg * dt;
    for (int i = 0; i < 3; ++i) {
        Q(3 + i, 3 + i)  = qa;
        Q(6 + i, 6 + i)  = qg;
        Q(9 + i, 9 + i)  = qba;
        Q(12 + i, 12 + i) = qbg;
    }

    Mat15 P;
    load_P(P_, P);
    P = F * P * F.transpose() + Q;
    P = 0.5 * (P + P.transpose());  // keep symmetric
    store_P(P, P_);

    if (std::isnan(P(0, 0)) || P.trace() > 1e18) diverged_ = true;
}

void ErrorStateKF::update_gps(const Vec3& pos_n, const Vec3& vel_n)
{
    if (!initialized_ || diverged_) return;

    Mat15 P;
    load_P(P_, P);

    // H = [I6 | 0]  (measures position & velocity).
    Eigen::Matrix<double, 6, 15> H = Eigen::Matrix<double, 6, 15>::Zero();
    H.block<6, 6>(0, 0) = Eigen::Matrix<double, 6, 6>::Identity();

    Eigen::Matrix<double, 6, 6> Rm = Eigen::Matrix<double, 6, 6>::Zero();
    const double rp = prm_.gps_pos_std * prm_.gps_pos_std;
    const double rv = prm_.gps_vel_std * prm_.gps_vel_std;
    for (int i = 0; i < 3; ++i) { Rm(i, i) = rp; Rm(3 + i, 3 + i) = rv; }

    Eigen::Matrix<double, 6, 1> y;
    y.segment<3>(0) = to_eig(pos_n) - to_eig(p_n_);
    y.segment<3>(3) = to_eig(vel_n) - to_eig(v_n_);

    const Eigen::Matrix<double, 6, 6> S = H * P * H.transpose() + Rm;
    const Eigen::Matrix<double, 15, 6> K = P * H.transpose() * S.inverse();
    const Vec15 dx = K * y;

    // Inject corrections (multiplicative for attitude).
    p_n_ = from_eig(to_eig(p_n_) + dx.segment<3>(0));
    v_n_ = from_eig(to_eig(v_n_) + dx.segment<3>(3));
    q_b_n_ = quat_normalize(quat_mul(q_b_n_, quat_from_rotvec(dx.segment<3>(6))));
    ba_b_ = from_eig(to_eig(ba_b_) + dx.segment<3>(9));
    bg_b_ = from_eig(to_eig(bg_b_) + dx.segment<3>(12));

    const Mat15 I = Mat15::Identity();
    P = (I - K * H) * P;
    P = 0.5 * (P + P.transpose());
    store_P(P, P_);

    if (std::isnan(P(0, 0)) || P.trace() > 1e18) diverged_ = true;
}

EstimatorState ErrorStateKF::state() const
{
    EstimatorState s;
    s.pos_n = p_n_;
    s.vel_n = v_n_;
    s.q_b_n = q_b_n_;
    s.bias_a_b = ba_b_;
    s.bias_g_b = bg_b_;
    s.cov_pos_trace = P_[0][0] + P_[1][1] + P_[2][2];
    s.cov_att_trace = P_[6][6] + P_[7][7] + P_[8][8];
    s.valid = initialized_ && !diverged_;
    return s;
}

}  // namespace gnc::estimation
