// gnc-backend/src/launch/LaunchAuthority.h
//
// Server-side ARM / LAUNCH / ABORT authority — the single source of truth for
// the launch interlock. The v8 audit (Safety §11, Backend §5) flagged that the
// ARM interlock was UI-only: `launchState`/`hardwareKeyPresent` lived purely in
// the frontend Redux `systemSlice`, so any client could "arm" by dispatching an
// action. This moves the authority server-side, behind RBAC, and gates ARM on a
// hardware key the client must present and the server must recognise.
//
// Deliberately free of any Drogon dependency so the state machine can be
// unit-tested standalone (see tests/launch_authority_test.cc). The HTTP surface
// lives in controllers/LaunchController.
//
// Threading: every public method takes an internal mutex; the authority is a
// process-global shared resource (one launch sequence per backend instance).

#pragma once

#include <mutex>
#include <string>

namespace gnc::backend {

enum class LaunchState {
    Idle,      // disarmed, ready
    Armed,     // hardware key accepted; launch permitted
    Launched,  // launch command issued
    Aborted,   // operator/auto abort latched
};

const char* to_string(LaunchState s);

struct LaunchSnapshot {
    LaunchState state                    = LaunchState::Idle;
    bool        armed                    = false;
    bool        launched                 = false;
    bool        hardware_key_provisioned = false;  // server knows a key
    std::string last_actor;
    std::string last_action;
    std::string abort_reason;
    long long   updated_at_unix_s        = 0;
};

struct LaunchResult {
    bool           ok          = false;
    int            http_status = 200;  // 200 ok, 403 key, 409 bad transition, 503 not provisioned
    std::string    error;
    LaunchSnapshot snapshot;
};

class LaunchAuthority {
public:
    LaunchAuthority() = default;

    // Process-global instance used by the HTTP controller.
    static LaunchAuthority& instance();

    // Install the expected hardware key (from config/env). An empty key means
    // "not provisioned": arm() then fails closed (503) — you cannot arm a
    // launcher whose key the server does not know.
    void configure(std::string expected_hardware_key);
    bool hardware_key_provisioned() const;

    // Transitions. `actor` is the verified JWT subject (for the snapshot/audit).
    LaunchResult arm   (const std::string& provided_key, const std::string& actor);
    LaunchResult launch(const std::string& actor);
    LaunchResult abort (const std::string& reason, const std::string& actor);
    LaunchResult reset (const std::string& actor);  // back to Idle (admin)

    LaunchSnapshot snapshot() const;

private:
    LaunchSnapshot snap_locked() const;  // caller holds mu_

    mutable std::mutex mu_;
    LaunchState state_       = LaunchState::Idle;
    std::string expected_key_;
    bool        configured_  = false;
    std::string last_actor_;
    std::string last_action_;
    std::string abort_reason_;
    long long   updated_at_  = 0;
};

}  // namespace gnc::backend
