$vsPath = & "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe" -latest -property installationPath
cmd.exe /c "call `"$vsPath\VC\Auxiliary\Build\vcvars64.bat`" && cmake --preset conan-release -DGNC_CORE_BUILD_TESTS=OFF && cmake --build --preset conan-release"
