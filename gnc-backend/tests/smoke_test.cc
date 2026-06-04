// gnc-backend/tests/smoke_test.cc
// Sanity tests independent of Drogon's HTTP listener — confirms the build
// links cleanly and gnc-core is reachable from the backend tree.

#include <gtest/gtest.h>

#include "gnc-core/hal/HalFactory.h"
#include "gnc-core/sep/SeparationTrigger.h"

TEST(BackendSmoke, GncCoreLinks)
{
    auto hs = gnc::hal::build_default(/*flight_build=*/false);
    ASSERT_TRUE(hs.clock != nullptr);
    ASSERT_TRUE(hs.any_stubbed);
}

TEST(BackendSmoke, SeparationTriggerEventIsRegistered)
{
    gnc::sep::Trigger t;
    EXPECT_TRUE(gnc::sep::from_string("event", t));
    EXPECT_FALSE(gnc::sep::from_string("manual", t));
}
