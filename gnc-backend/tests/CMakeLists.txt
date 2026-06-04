cmake_minimum_required(VERSION 3.20)

find_package(GTest CONFIG REQUIRED)

add_executable(gnc_backend_unit_tests
    smoke_test.cc
    validator_test.cc
)

target_link_libraries(gnc_backend_unit_tests
    PRIVATE
        gnc_backend_core
        GTest::gtest
        GTest::gtest_main
)

# Tests need to know where the rockets/ tree lives so they can load BA.
# We pass the absolute path at configure time so tests are runnable from
# any working directory.
target_compile_definitions(gnc_backend_unit_tests PRIVATE
    GNC_TEST_ROCKETS_ROOT="${CMAKE_CURRENT_SOURCE_DIR}/../../rockets"
)

include(GoogleTest)
gtest_discover_tests(gnc_backend_unit_tests)
