# gnc-stm32/cmake/stm32h7.toolchain.cmake
#
# v8 P5.1. CMake toolchain for cross-compiling the Path B flight image to the
# STM32H7 (Cortex-M7F) with the GNU Arm Embedded toolchain. Use with:
#
#   cmake -B build-stm32 -S gnc-stm32 \
#         -DCMAKE_TOOLCHAIN_FILE=gnc-stm32/cmake/stm32h7.toolchain.cmake \
#         -DGNC_TARGET_STM32H7=ON
#
# The board-support package (vendor CMSIS headers, startup .s, linker script,
# RTOS) is supplied separately on the include/link path; this file only pins
# the compiler, CPU flags and bare-metal link mode. Host/CI builds do NOT use
# this file (they build the bench target with the system compiler).

set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR arm)

set(TOOLCHAIN_PREFIX arm-none-eabi-)
set(CMAKE_C_COMPILER   ${TOOLCHAIN_PREFIX}gcc)
set(CMAKE_CXX_COMPILER ${TOOLCHAIN_PREFIX}g++)
set(CMAKE_ASM_COMPILER ${TOOLCHAIN_PREFIX}gcc)
set(CMAKE_OBJCOPY      ${TOOLCHAIN_PREFIX}objcopy CACHE INTERNAL "")
set(CMAKE_SIZE         ${TOOLCHAIN_PREFIX}size    CACHE INTERNAL "")

# Cortex-M7 with double-precision FPU (STM32H7).
set(CPU_FLAGS "-mcpu=cortex-m7 -mthumb -mfpu=fpv5-d16 -mfloat-abi=hard")
set(CMAKE_C_FLAGS_INIT   "${CPU_FLAGS} -ffunction-sections -fdata-sections")
set(CMAKE_CXX_FLAGS_INIT "${CPU_FLAGS} -ffunction-sections -fdata-sections -fno-exceptions -fno-rtti")
set(CMAKE_EXE_LINKER_FLAGS_INIT "${CPU_FLAGS} -Wl,--gc-sections --specs=nano.specs")

# We are building a static firmware image, not host executables, so skip the
# compiler test that tries to link a hosted program.
set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)

set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
