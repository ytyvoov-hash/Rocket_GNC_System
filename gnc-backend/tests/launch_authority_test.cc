// gnc-backend/tests/launch_authority_test.cc
// Unit tests for the Drogon-free launch interlock state machine (P0.2b).
// Verifies: fail-closed when no key is provisioned, hardware-key gating of ARM,
// the legal transition graph, and that ABORT is always honoured.

#include "launch/LaunchAuthority.h"

#include <gtest/gtest.h>

using gnc::backend::LaunchAuthority;
using gnc::backend::LaunchState;

namespace {
constexpr const char* kKey   = "CORRECT-HORSE-BATTERY-STAPLE";
constexpr const char* kActor = "user-abc";
}  // namespace

TEST(LaunchAuthority, NotProvisionedRefusesArm)
{
    LaunchAuthority a;  // never configured
    EXPECT_FALSE(a.hardware_key_provisioned());

    auto r = a.arm(kKey, kActor);
    EXPECT_FALSE(r.ok);
    EXPECT_EQ(r.http_status, 503);
    EXPECT_EQ(a.snapshot().state, LaunchState::Idle);
}

TEST(LaunchAuthority, EmptyConfiguredKeyIsNotProvisioned)
{
    LaunchAuthority a;
    a.configure("");
    EXPECT_FALSE(a.hardware_key_provisioned());
    EXPECT_EQ(a.arm("", kActor).http_status, 503);
}

TEST(LaunchAuthority, WrongKeyRejectedDoesNotArm)
{
    LaunchAuthority a;
    a.configure(kKey);
    EXPECT_TRUE(a.hardware_key_provisioned());

    auto r = a.arm("not-the-key", kActor);
    EXPECT_FALSE(r.ok);
    EXPECT_EQ(r.http_status, 403);
    EXPECT_EQ(a.snapshot().state, LaunchState::Idle);
    EXPECT_FALSE(a.snapshot().armed);
}

TEST(LaunchAuthority, CorrectKeyArms)
{
    LaunchAuthority a;
    a.configure(kKey);

    auto r = a.arm(kKey, kActor);
    EXPECT_TRUE(r.ok);
    EXPECT_EQ(r.http_status, 200);
    EXPECT_EQ(a.snapshot().state, LaunchState::Armed);
    EXPECT_TRUE(a.snapshot().armed);
    EXPECT_EQ(a.snapshot().last_actor, kActor);
}

TEST(LaunchAuthority, CannotLaunchUnlessArmed)
{
    LaunchAuthority a;
    a.configure(kKey);

    auto r = a.launch(kActor);  // still Idle
    EXPECT_FALSE(r.ok);
    EXPECT_EQ(r.http_status, 409);
    EXPECT_EQ(a.snapshot().state, LaunchState::Idle);
}

TEST(LaunchAuthority, ArmThenLaunch)
{
    LaunchAuthority a;
    a.configure(kKey);
    ASSERT_TRUE(a.arm(kKey, kActor).ok);

    auto r = a.launch(kActor);
    EXPECT_TRUE(r.ok);
    EXPECT_EQ(a.snapshot().state, LaunchState::Launched);
    EXPECT_TRUE(a.snapshot().launched);
}

TEST(LaunchAuthority, CannotReArmFromArmedOrLaunched)
{
    LaunchAuthority a;
    a.configure(kKey);
    ASSERT_TRUE(a.arm(kKey, kActor).ok);

    EXPECT_EQ(a.arm(kKey, kActor).http_status, 409);  // already Armed

    ASSERT_TRUE(a.launch(kActor).ok);
    EXPECT_EQ(a.arm(kKey, kActor).http_status, 409);  // Launched
    EXPECT_EQ(a.launch(kActor).http_status, 409);     // double launch
}

TEST(LaunchAuthority, AbortAlwaysHonoured)
{
    LaunchAuthority a;
    a.configure(kKey);

    // From Idle.
    EXPECT_TRUE(a.abort("RANGE_VIOLATION", kActor).ok);
    EXPECT_EQ(a.snapshot().state, LaunchState::Aborted);
    EXPECT_EQ(a.snapshot().abort_reason, "RANGE_VIOLATION");
    EXPECT_FALSE(a.snapshot().armed);

    // From Launched.
    LaunchAuthority b;
    b.configure(kKey);
    ASSERT_TRUE(b.arm(kKey, kActor).ok);
    ASSERT_TRUE(b.launch(kActor).ok);
    EXPECT_TRUE(b.abort("", kActor).ok);
    EXPECT_EQ(b.snapshot().state, LaunchState::Aborted);
    EXPECT_EQ(b.snapshot().abort_reason, "OPERATOR_ABORT");  // default
}

TEST(LaunchAuthority, ReArmAfterAbort)
{
    LaunchAuthority a;
    a.configure(kKey);
    ASSERT_TRUE(a.abort("scrub", kActor).ok);

    auto r = a.arm(kKey, kActor);
    EXPECT_TRUE(r.ok);
    EXPECT_EQ(a.snapshot().state, LaunchState::Armed);
}

TEST(LaunchAuthority, ResetReturnsToIdle)
{
    LaunchAuthority a;
    a.configure(kKey);
    ASSERT_TRUE(a.arm(kKey, kActor).ok);
    ASSERT_TRUE(a.launch(kActor).ok);

    EXPECT_TRUE(a.reset(kActor).ok);
    EXPECT_EQ(a.snapshot().state, LaunchState::Idle);
    EXPECT_TRUE(a.snapshot().abort_reason.empty());
}
