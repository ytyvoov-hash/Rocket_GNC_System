cmake_minimum_required(VERSION 3.20)

# ---------------------------------------------------------------------------
# Catch2 — fetch v3 from GitHub if not already present.
# Falls back gracefully if FetchContent is unavailable.
# ---------------------------------------------------------------------------
include(FetchContent)

FetchContent_Declare(
    Catch2
    GIT_REPOSITORY https://github.com/catchorg/Catch2.git
    GIT_TAG        v3.5.4
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(Catch2)

# ---------------------------------------------------------------------------
# Smoke test: HAL stub round-trip + types sanity.
# ---------------------------------------------------------------------------
add_executable(gnc_core_smoke_test
    smoke_test.cc
    sim_test.cc
    nav_eskf_test.cc
    alloc_test.cc
    staging_test.cc
    closed_loop_test.cc
)

target_link_libraries(gnc_core_smoke_test
    PRIVATE
        gnc-core
        Catch2::Catch2WithMain
)

include(CTest)
include(Catch)
catch_discover_tests(gnc_core_smoke_test)
