@echo off
REM ============================================================
REM GNC Backend Build Script
REM ============================================================
REM This script builds the gnc-backend project with all dependencies
REM Compatible with Visual Studio 2022 Developer Command Prompt
REM ============================================================

echo ============================================================
echo GNC Backend Build Script
echo ============================================================
echo.

REM Step 1: Set PATH for CMake and Conan
echo [1/6] Setting up PATH for CMake and Conan...
set PATH=C:\Users\pro\Downloads\cmake-4.3.2\cmake-4.3.2-windows-x86_64\bin;%PATH%
set PATH=C:\Users\pro\AppData\Roaming\Python\Python39\Scripts;%PATH%
echo PATH configured successfully
echo.

REM Step 2: Verify tools
echo [2/6] Verifying tools...
cmake --version
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: CMake not found
    pause
    exit /b 1
)
conan --version
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Conan not found
    pause
    exit /b 1
)
echo Tools verified successfully
echo.

REM Step 3: Update Conan profile to C++20
echo [3/6] Updating Conan profile to C++20...
conan profile update settings.compiler.cppstd=20
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Failed to update profile, continuing anyway...
)
echo Profile updated
echo.

REM Step 4: Install dependencies with Conan
echo [4/6] Installing dependencies with Conan...
echo This may take several minutes (building boost, hdf5, drogon, etc.)
conan install . --output-folder=build --build=missing
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Conan install failed
    pause
    exit /b 1
)
echo Dependencies installed successfully
echo.

REM Step 5: Configure with CMake
echo [5/6] Configuring project with CMake...
cmake -S . -B build -DCMAKE_TOOLCHAIN_FILE=build\conan_toolchain.cmake
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: CMake configuration failed
    pause
    exit /b 1
)
echo Project configured successfully
echo.

REM Step 6: Build
echo [6/6] Building project...
cmake --build build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)
echo Build completed successfully!
echo.

echo ============================================================
echo Build Complete!
echo ============================================================
echo.
echo To run the server:
echo   cd build
echo   gnc-backend.exe ..\config\dev.json
echo.
pause
