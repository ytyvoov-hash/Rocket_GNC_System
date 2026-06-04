Remove-Item -Recurse -Force build -ErrorAction SilentlyContinue

# Auto-detect profile. It will detect GCC since MSVC is not installed.
conan profile detect --force

# Run conan install
conan install . --output-folder=build --build=missing -c tools.cmake.cmaketoolchain:generator=Ninja -s compiler.cppstd=20

# Configure CMake
cmake --preset conan-release -DGNC_CORE_BUILD_TESTS=OFF

# Build
cmake --build --preset conan-release
