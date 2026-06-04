// gnc-backend/src/launch/LaunchAuthority.cc
// See LaunchAuthority.h. State machine:
//
//   Idle ──arm(valid key)──▶ Armed ──launch──▶ Launched
//    ▲                         │                   │
//    │ reset(admin)            └────────abort──────┘
//    │                                    │
//   Aborted ◀───────────abort (from any)──┘
//   Aborted ──arm(valid key)──▶ Armed     (re-arm after a scrubbed attempt)
//
// abort is always honoured (safety); arm requires a provisioned + matching
// hardware key; launch requires Armed.

#include "LaunchAuthority.h"

#include <chrono>

namespace gnc::backend {

const char* to_string(LaunchState s)
{
    switch (s) {
        case LaunchState::Idle:     return "IDLE";
        case LaunchState::Armed:    return "ARMED";
        case LaunchState::Launched: return "LAUNCHED";
        case LaunchState::Aborted:  return "ABORTED";
    }
    return "IDLE";
}

namespace {

long long now_unix_s()
{
    return std::chrono::duration_cast<std::chrono::seconds>(
               std::chrono::system_clock::now().time_since_epoch())
        .count();
}

// Constant-time comparison so a wrong key cannot be recovered by timing the
// response. Always scans the full length of the longer string.
bool constant_time_equal(const std::string& a, const std::string& b)
{
    const std::size_t n = a.size() > b.size() ? a.size() : b.size();
    unsigned char diff = static_cast<unsigned char>(a.size() ^ b.size());
    for (std::size_t i = 0; i < n; ++i) {
        const unsigned char ca = i < a.size() ? static_cast<unsigned char>(a[i]) : 0;
        const unsigned char cb = i < b.size() ? static_cast<unsigned char>(b[i]) : 0;
        diff |= static_cast<unsigned char>(ca ^ cb);
    }
    return diff == 0;
}

}  // namespace

LaunchAuthority& LaunchAuthority::instance()
{
    static LaunchAuthority inst;
    return inst;
}

void LaunchAuthority::configure(std::string expected_hardware_key)
{
    std::lock_guard<std::mutex> lk(mu_);
    expected_key_ = std::move(expected_hardware_key);
    configured_   = !expected_key_.empty();
}

bool LaunchAuthority::hardware_key_provisioned() const
{
    std::lock_guard<std::mutex> lk(mu_);
    return configured_;
}

LaunchSnapshot LaunchAuthority::snap_locked() const
{
    LaunchSnapshot s;
    s.state                    = state_;
    s.armed                    = state_ == LaunchState::Armed;
    s.launched                 = state_ == LaunchState::Launched;
    s.hardware_key_provisioned = configured_;
    s.last_actor               = last_actor_;
    s.last_action              = last_action_;
    s.abort_reason             = abort_reason_;
    s.updated_at_unix_s        = updated_at_;
    return s;
}

LaunchSnapshot LaunchAuthority::snapshot() const
{
    std::lock_guard<std::mutex> lk(mu_);
    return snap_locked();
}

LaunchResult LaunchAuthority::arm(const std::string& provided_key,
                                  const std::string& actor)
{
    std::lock_guard<std::mutex> lk(mu_);
    LaunchResult r;

    if (!configured_) {
        r.ok = false;
        r.http_status = 503;
        r.error = "hardware key not provisioned on the server; cannot arm";
        r.snapshot = snap_locked();
        return r;
    }
    if (!constant_time_equal(provided_key, expected_key_)) {
        r.ok = false;
        r.http_status = 403;
        r.error = "invalid hardware key";
        r.snapshot = snap_locked();
        return r;
    }
    if (state_ != LaunchState::Idle && state_ != LaunchState::Aborted) {
        r.ok = false;
        r.http_status = 409;
        r.error = std::string("cannot arm from state ") + to_string(state_);
        r.snapshot = snap_locked();
        return r;
    }

    state_        = LaunchState::Armed;
    last_actor_   = actor;
    last_action_  = "ARM";
    abort_reason_.clear();
    updated_at_   = now_unix_s();

    r.ok = true;
    r.http_status = 200;
    r.snapshot = snap_locked();
    return r;
}

LaunchResult LaunchAuthority::launch(const std::string& actor)
{
    std::lock_guard<std::mutex> lk(mu_);
    LaunchResult r;

    if (state_ != LaunchState::Armed) {
        r.ok = false;
        r.http_status = 409;
        r.error = std::string("cannot launch from state ") + to_string(state_)
                + "; must be ARMED";
        r.snapshot = snap_locked();
        return r;
    }

    state_       = LaunchState::Launched;
    last_actor_  = actor;
    last_action_ = "LAUNCH";
    updated_at_  = now_unix_s();

    r.ok = true;
    r.http_status = 200;
    r.snapshot = snap_locked();
    return r;
}

LaunchResult LaunchAuthority::abort(const std::string& reason,
                                    const std::string& actor)
{
    std::lock_guard<std::mutex> lk(mu_);
    // Abort is always honoured, from any state.
    state_        = LaunchState::Aborted;
    abort_reason_ = reason.empty() ? "OPERATOR_ABORT" : reason;
    last_actor_   = actor;
    last_action_  = "ABORT";
    updated_at_   = now_unix_s();

    LaunchResult r;
    r.ok = true;
    r.http_status = 200;
    r.snapshot = snap_locked();
    return r;
}

LaunchResult LaunchAuthority::reset(const std::string& actor)
{
    std::lock_guard<std::mutex> lk(mu_);
    state_        = LaunchState::Idle;
    abort_reason_.clear();
    last_actor_   = actor;
    last_action_  = "RESET";
    updated_at_   = now_unix_s();

    LaunchResult r;
    r.ok = true;
    r.http_status = 200;
    r.snapshot = snap_locked();
    return r;
}

}  // namespace gnc::backend
