cmake_minimum_required(VERSION 3.20)
project(gnc-stm32
    VERSION 0.1.0
    DESCRIPTION "Path B (STM32H7) flight target hosting gnc-core over the HAL (v8 P5.1)"
    LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# ---------------------------------------------------------------------------
# Build mode:
#   * Host bench (default): native drivers absent -> stub HAL; the flight loop,
#     watchdog and safe-mode path run on a developer machine and in CI.
#   * Cross target (-DGNC_TARGET_STM32H7=ON + the toolchain file in cmake/):
#     compiles the platform/stm32h7 native drivers and defines GNC_FLIGHT_BUILD.
# ---------------------------------------------------------------------------
option(GNC_TARGET_STM32H7 "Cross-compile for the STM32H7 flight target" OFF)
option(GNC_STM32_BUILD_TESTS "Build the Path B host regression tests" OFF)

# Pull in gnc-core (sibling dir) if it is not already a target in this build.
if(NOT TARGET gnc-core)
    add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../gnc-core
                     ${CMAKE_BINARY_DIR}/gnc-core-build)
endif()

# ---------------------------------------------------------------------------
# Portable flight-application library (host + target).
# ---------------------------------------------------------------------------
set(GNC_STM32_SOURCES
    src/Sha256.cc
    src/FlightBuildGuard.cc
    src/FlightLoop.cc
)

if(GNC_TARGET_STM32H7)
    # Native HAL drivers (require the vendor CMSIS SDK on the include path).
    list(APPEND GNC_STM32_SOURCES src/platform/stm32h7/Stm32Clock.cc)
    add_compile_definitions(GNC_TARGET_STM32H7 GNC_FLIGHT_BUILD)
endif()

add_library(gnc-stm32-app STATIC ${GNC_STM32_SOURCES})
target_include_directories(gnc-stm32-app PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>)
target_link_libraries(gnc-stm32-app PUBLIC gnc-core)
target_compile_features(gnc-stm32-app PUBLIC cxx_std_17)

# ---------------------------------------------------------------------------
# Host bench executable (not built for the cross target, which has its own
# RTOS/bare-metal entrypoint + linker script supplied by the board package).
# ---------------------------------------------------------------------------
if(NOT GNC_TARGET_STM32H7)
    add_executable(gnc_stm32_bench src/main_bench.cc)
    target_link_libraries(gnc_stm32_bench PRIVATE gnc-stm32-app)
endif()

# ---------------------------------------------------------------------------
# Host regression tests (Catch2 v3 via FetchContent, matching gnc-core/tests).
# ---------------------------------------------------------------------------
if(GNC_STM32_BUILD_TESTS AND NOT GNC_TARGET_STM32H7)
    include(FetchContent)
    if(NOT TARGET Catch2::Catch2WithMain)
        FetchContent_Declare(
            Catch2
            GIT_REPOSITORY https://github.com/catchorg/Catch2.git
            GIT_TAG        v3.5.4
            GIT_SHALLOW    TRUE
        )
        FetchContent_MakeAvailable(Catch2)
    endif()

    enable_testing()
    add_executable(gnc_stm32_test tests/flight_loop_test.cc)
    target_link_libraries(gnc_stm32_test PRIVATE gnc-stm32-app Catch2::Catch2WithMain)

    include(CTest)
    include(Catch)
    catch_discover_tests(gnc_stm32_test)
endif()
