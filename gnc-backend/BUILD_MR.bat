@echo off
set "VswherePath=C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe"
for /f "usebackq tokens=*" %%i in (`"%VswherePath%" -latest -products * -property installationPath`) do set "VSPath=%%i"
call "%VSPath%\Common7\Tools\VsDevCmd.bat" -arch=x64

cmake --preset conan-default -DGNC_CORE_BUILD_TESTS=OFF
cmake --build build\build --config Release
