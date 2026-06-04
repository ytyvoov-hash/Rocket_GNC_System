// gnc-backend/tests/validator_test.cc
//
// Tier-1 unit tests for the parser + validator pipeline against the canonical
// `rockets/BA/` template. These run on every PR and act as the regression
// gate for clauses C1, C2, C11, C15, C17 (Wave 1) and shape contract for the
// stub clauses (C3-C10, C12-C14, C16, C18-C25).
//
// The path to the rockets/ root is injected at configure time via
// GNC_TEST_ROCKETS_ROOT (see tests/CMakeLists.txt).

#include <gtest/gtest.h>

#include <filesystem>
#include <string>

#include "parser/TemplateLoader.h"
#include "validator/Validator.h"
#include "validator/Verdict.h"

#ifndef GNC_TEST_ROCKETS_ROOT
#error "GNC_TEST_ROCKETS_ROOT must be defined by CMake"
#endif

namespace fs = std::filesystem;
using namespace gnc::backend;

class BaTemplateTest : public ::testing::Test {
protected:
    void SetUp() override
    {
        const fs::path root(GNC_TEST_ROCKETS_ROOT);
        ASSERT_TRUE(fs::is_directory(root))
            << "rockets/ root not found: " << root.string();
        loader_  = std::make_unique<parser::TemplateLoader>(root);
        result_  = loader_->load("BA");
        ASSERT_TRUE(result_.ok)
            << "BA template failed to parse; first diag: "
            << (result_.diagnostics.empty() ? "<none>"
                                            : result_.diagnostics.front().message);
    }

    std::unique_ptr<parser::TemplateLoader> loader_;
    parser::ParseResult                     result_;
};

// --------------------------------------------------------------------------
// Parser shape contract.
// --------------------------------------------------------------------------
TEST_F(BaTemplateTest, MergedDocHasCanonicalKeys)
{
    EXPECT_TRUE(result_.data.contains("rocket"));
    EXPECT_TRUE(result_.data.contains("hardware"));
    EXPECT_TRUE(result_.data.contains("inventory"));
    EXPECT_TRUE(result_.data["rocket"].contains("stages"));
    EXPECT_TRUE(result_.data["rocket"]["stages"].is_array());
    EXPECT_GT(result_.data["rocket"]["stages"].size(), 0u);
}

TEST_F(BaTemplateTest, InventoryListsCsvFiles)
{
    const auto& inv = result_.data["inventory"];
    ASSERT_TRUE(inv.contains("csv_files"));
    ASSERT_TRUE(inv["csv_files"].is_array());
    // BA carries 8 CSVs (aero, atm, ca_motor_on/off, damping, fin_def,
    // fin_loads, roll_aero, thrust_curve). Allow >= 6 for tolerance.
    EXPECT_GE(inv["csv_files"].size(), 6u);
}

// --------------------------------------------------------------------------
// Validator Wave-1 clauses MUST pass on the canonical BA template.
// If one of these starts failing, BA itself is broken.
// --------------------------------------------------------------------------
TEST_F(BaTemplateTest, RunAllReturns25ClauseResults)
{
    auto report = validator::run_all(result_.data);
    EXPECT_EQ(report.clauses.size(), 25u);
}

TEST_F(BaTemplateTest, C1_RequiredKeysPresent)
{
    auto r = validator::run_C1(result_.data);
    EXPECT_EQ(r.clause, "C1");
    EXPECT_EQ(r.verdict, validator::Verdict::Pass) << r.message;
}

TEST_F(BaTemplateTest, C2_AllStagesHavePositiveDryMass)
{
    auto r = validator::run_C2(result_.data);
    EXPECT_EQ(r.clause, "C2");
    EXPECT_EQ(r.verdict, validator::Verdict::Pass) << r.message;
}

TEST_F(BaTemplateTest, C11_HardwareMappingPresent)
{
    auto r = validator::run_C11(result_.data);
    EXPECT_EQ(r.clause, "C11");
    EXPECT_EQ(r.verdict, validator::Verdict::Pass) << r.message;
}

TEST_F(BaTemplateTest, C15_NumStagesMatchesArrayLength)
{
    auto r = validator::run_C15(result_.data);
    EXPECT_EQ(r.clause, "C15");
    EXPECT_EQ(r.verdict, validator::Verdict::Pass) << r.message;
}

TEST_F(BaTemplateTest, C17_TerminalAndSeparationRulesHold)
{
    auto r = validator::run_C17(result_.data);
    EXPECT_EQ(r.clause, "C17");
    EXPECT_EQ(r.verdict, validator::Verdict::Pass) << r.message;
}

// --------------------------------------------------------------------------
// Aggregate: until the remaining 20 clauses are implemented, the report's
// overall verdict will be WARN (NotApplicable counts as not-failing). It
// MUST NOT be FAIL on the canonical BA template.
// --------------------------------------------------------------------------
TEST_F(BaTemplateTest, AggregateNotFail)
{
    auto report = validator::run_all(result_.data);
    auto agg    = validator::aggregate(report.clauses);
    EXPECT_NE(agg, validator::Verdict::Fail)
        << "BA template must not fail validation. JSON: "
        << to_json(report).dump(2);
}

// --------------------------------------------------------------------------
// JSON shape is the FE contract; round-trip via to_json + look up by name.
// --------------------------------------------------------------------------
TEST_F(BaTemplateTest, ReportJsonContainsExpectedShape)
{
    auto report = validator::run_all(result_.data);
    auto j      = validator::to_json(report);
    ASSERT_TRUE(j.contains("clauses"));
    ASSERT_TRUE(j.contains("overall"));
    ASSERT_TRUE(j.contains("run_at"));
    EXPECT_TRUE(j["run_at"].is_null());        // run_at filled by controller
    EXPECT_EQ(j["clauses"].size(), 25u);
    // Spot-check ordering: C1 first, C25 last.
    EXPECT_EQ(j["clauses"].front()["clause"], "C1");
    EXPECT_EQ(j["clauses"].back()["clause"],  "C25");
}

// --------------------------------------------------------------------------
// Negative test: a synthetic broken doc must FAIL C1.
// --------------------------------------------------------------------------
TEST(ValidatorNegative, EmptyDocFailsC1)
{
    nlohmann::json empty_doc = nlohmann::json::object();
    auto r = validator::run_C1(empty_doc);
    EXPECT_EQ(r.verdict, validator::Verdict::Fail);
}

TEST(ValidatorNegative, NumStagesMismatchFailsC15)
{
    nlohmann::json doc = {
        {"rocket", {
            {"template_id", "TEST"},
            {"num_stages", 3},
            {"stages", nlohmann::json::array({
                {{"is_terminal", false}, {"physical", {{"mass_dry_kg", 1.0}}}},
                {{"is_terminal", true},  {"physical", {{"mass_dry_kg", 1.0}}}}
            })}
        }}
    };
    auto r = validator::run_C15(doc);
    EXPECT_EQ(r.verdict, validator::Verdict::Fail);
}

TEST(ValidatorNegative, TwoTerminalsFailsC17)
{
    nlohmann::json doc = {
        {"rocket", {
            {"template_id", "TEST"},
            {"num_stages", 2},
            {"stages", nlohmann::json::array({
                {{"is_terminal", true}, {"physical", {{"mass_dry_kg", 1.0}}}},
                {{"is_terminal", true}, {"physical", {{"mass_dry_kg", 1.0}}}}
            })}
        }}
    };
    auto r = validator::run_C17(doc);
    EXPECT_EQ(r.verdict, validator::Verdict::Fail);
}
