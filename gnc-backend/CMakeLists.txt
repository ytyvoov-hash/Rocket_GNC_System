cmake_minimum_required(VERSION 3.20)
project(gnc-backend
    VERSION 0.1.0
    DESCRIPTION "C++/Drogon backend for the Rocket GNC platform (v5.4)"
    LANGUAGES CXX)

# Drogon requires C++17 minimum; we use C++20 here for coroutines.
# Per Decision 4, gnc-core stays at C++17.
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(MSVC)
    add_compile_options(/W4 /permissive-)
    add_compile_definitions(NOMINMAX)
else()
    add_compile_options(-Wall -Wextra -Wpedantic -Wshadow)
endif()

# ---------------------------------------------------------------------------
# Pull in gnc-core (sibling directory). Direct link, no IPC.
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Pull in gnc-core (sibling directory). Direct link, no IPC.
# ---------------------------------------------------------------------------
add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../gnc-core gnc-core-build)
target_include_directories(gnc-core INTERFACE "${CMAKE_CURRENT_SOURCE_DIR}/../gnc-core/third_party/casadi/include")
target_include_directories(gnc-core INTERFACE "${CMAKE_CURRENT_SOURCE_DIR}/../gnc-core/third_party/casadi/include/eigen3")

# ---------------------------------------------------------------------------
# External dependencies (Conan/vcpkg supplies these).
# ---------------------------------------------------------------------------
find_package(Drogon CONFIG REQUIRED)
find_package(yaml-cpp CONFIG REQUIRED)
find_package(OpenSSL REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)
# find_package(libpqxx CONFIG REQUIRED)        # enable when DB wired
# find_package(HDF5 REQUIRED COMPONENTS C CXX) # enable when log writer wired

# ---------------------------------------------------------------------------
# Drogon-free static library: parser + validator. Pulled in by both the
# executable and by the gtest binary so unit tests can exercise the on-disk
# rockets/ tree without spinning up an HTTP listener.
# ---------------------------------------------------------------------------
file(GLOB_RECURSE BACKEND_CORE_SOURCES CONFIGURE_DEPENDS
    "src/parser/*.cc"
    "src/validator/*.cc"
)

add_library(gnc_backend_core STATIC ${BACKEND_CORE_SOURCES})

target_include_directories(gnc_backend_core PUBLIC src)
target_link_libraries(gnc_backend_core
    PUBLIC
        gnc-core
        yaml-cpp::yaml-cpp
        nlohmann_json::nlohmann_json
)

# ---------------------------------------------------------------------------
# Executable. Pulls in everything in src/ except the parser/validator code,
# which already comes via gnc_backend_core.
# ---------------------------------------------------------------------------
file(GLOB_RECURSE BACKEND_APP_SOURCES CONFIGURE_DEPENDS
    "src/*.cc"
    "src/*.cpp"
)
list(FILTER BACKEND_APP_SOURCES EXCLUDE REGEX "/parser/")
list(FILTER BACKEND_APP_SOURCES EXCLUDE REGEX "/validator/")

add_executable(gnc-backend ${BACKEND_APP_SOURCES})

target_include_directories(gnc-backend PRIVATE src)
target_link_libraries(gnc-backend
    PRIVATE
        gnc_backend_core
        Drogon::Drogon
        OpenSSL::SSL
        OpenSSL::Crypto
)

# Windows-specific libraries for HAL implementations
if(MSVC)
    target_link_libraries(gnc-backend PRIVATE setupapi pdh psapi)
endif()

# ---------------------------------------------------------------------------
# Tests (gtest; Tier 1 CI).
# ---------------------------------------------------------------------------
option(GNC_BACKEND_BUILD_TESTS "Build gnc-backend gtest unit tests" OFF)
if(GNC_BACKEND_BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()
