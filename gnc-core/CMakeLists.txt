cmake_minimum_required(VERSION 3.20)
project(gnc-core
    VERSION 0.1.0
    DESCRIPTION "Pure C++17 GNC algorithms and HAL (v5.4)"
    LANGUAGES CXX)

# ---------------------------------------------------------------------------
# Decision 13: pure C++17, no platform headers.
# ---------------------------------------------------------------------------
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(MSVC)
    add_compile_options(/DEIGEN_DONT_VECTORIZE)
    add_compile_options(/W4)
else()
    add_compile_options(-Wall -Wextra -Wpedantic -Wshadow -Wconversion)
    if(NOT CMAKE_BUILD_TYPE)
        set(CMAKE_BUILD_TYPE Release)
    endif()
endif()

# ---------------------------------------------------------------------------
# Library target (header-only public API + .cc implementations).
# ---------------------------------------------------------------------------
file(GLOB_RECURSE GNC_CORE_SOURCES CONFIGURE_DEPENDS
    "src/*.cc"
    "src/*.cpp"
)
file(GLOB_RECURSE GNC_CORE_HEADERS CONFIGURE_DEPENDS
    "include/gnc-core/*.h"
    "include/gnc-core/*.hpp"
)

add_library(gnc-core STATIC ${GNC_CORE_SOURCES} ${GNC_CORE_HEADERS})
target_include_directories(gnc-core PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>
      $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/third_party/casadi/include/eigen3>
)
target_compile_features(gnc-core PUBLIC cxx_std_17)

# ---------------------------------------------------------------------------
# Tests (Catch2 single-header v2 expected at extern/catch2/catch.hpp,
# or fetched via FetchContent when available).
# ---------------------------------------------------------------------------
option(GNC_CORE_BUILD_TESTS "Build gnc-core Catch2 unit tests" OFF)
if(GNC_CORE_BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
else()
    # Skip tests directory entirely when tests are disabled
    message(STATUS "gnc-core tests disabled (GNC_CORE_BUILD_TESTS=OFF)")
endif()

# ---------------------------------------------------------------------------
# HAL leak surveillance (Wave 1 L1).
# ---------------------------------------------------------------------------
add_custom_target(check_hal_leak
    COMMAND ${CMAKE_COMMAND} -E echo "Running L1 forbidden-include check..."
    COMMAND ${CMAKE_COMMAND} -P "${CMAKE_CURRENT_SOURCE_DIR}/tools/check_hal_leak.cmake"
    WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
    COMMENT "Decision 13 Wave 1 L1: no platform headers in gnc-core"
)
