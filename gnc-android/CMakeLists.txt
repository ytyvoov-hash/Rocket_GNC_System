cmake_minimum_required(VERSION 3.20)
project(gnc-android
    VERSION 0.1.0
    DESCRIPTION "Path A (Android) host substrate for gnc-core over the HAL (v8 P5.2)"
    LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# ---------------------------------------------------------------------------
# Build mode:
#   * Host build (default): native code (link protocol, clock, GNC bridge)
#     compiles and is unit-tested on a developer machine / CI. The JVM/JNI glue
#     is excluded.
#   * Android target (NDK toolchain + -DGNC_ANDROID_JNI=ON): additionally
#     compiles jni_glue.cc (needs <jni.h> from the NDK) into a shared library
#     for the Kotlin app. See cmake/android.notes.md.
# ---------------------------------------------------------------------------
option(GNC_ANDROID_JNI "Compile the JNI glue for the Android NDK build" OFF)
option(GNC_ANDROID_BUILD_TESTS "Build the Path A host regression tests" OFF)

# Pull in gnc-core (sibling dir) if it is not already a target in this build.
if(NOT TARGET gnc-core)
    add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../gnc-core
                     ${CMAKE_BINARY_DIR}/gnc-core-build)
endif()

# ---------------------------------------------------------------------------
# Portable Path A substrate library (host + Android).
# ---------------------------------------------------------------------------
set(GNC_ANDROID_SOURCES
    native/src/Messages.cc
    native/src/UsbCdcLink.cc
    native/src/AndroidClock.cc
    native/src/GncBridge.cc
)

if(GNC_ANDROID_JNI)
    list(APPEND GNC_ANDROID_SOURCES native/src/jni_glue.cc)
    add_compile_definitions(GNC_ANDROID_JNI)
endif()

add_library(gnc-android-app STATIC ${GNC_ANDROID_SOURCES})
target_include_directories(gnc-android-app PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/native/include>)
target_link_libraries(gnc-android-app PUBLIC gnc-core)
target_compile_features(gnc-android-app PUBLIC cxx_std_17)

if(GNC_ANDROID_JNI)
    # Shared object loaded by the app via System.loadLibrary("gnc-core-jni").
    add_library(gnc-core-jni SHARED native/src/jni_glue.cc)
    target_link_libraries(gnc-core-jni PRIVATE gnc-android-app)
endif()

# ---------------------------------------------------------------------------
# Host regression tests (Catch2 v3 via FetchContent, matching gnc-core/tests).
# ---------------------------------------------------------------------------
if(GNC_ANDROID_BUILD_TESTS AND NOT GNC_ANDROID_JNI)
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
    add_executable(gnc_android_test tests/bridge_test.cc)
    target_link_libraries(gnc_android_test PRIVATE gnc-android-app Catch2::Catch2WithMain)

    include(CTest)
    include(Catch)
    catch_discover_tests(gnc_android_test)
endif()
