# L1 forbidden-include check (v5.4 Decision 13, Wave 1).
# Scans src/ and include/ for any banned platform header.
# Run via:  cmake -P tools/check_hal_leak.cmake
# Also wired into the `check_hal_leak` target in the root CMakeLists.txt.

set(BANNED_PATTERNS
    "#include[ \t]*[<\"]jni\\.h"
    "#include[ \t]*[<\"]android/"
    "#include[ \t]*[<\"]linux/"
    "#include[ \t]*[<\"]stm32"
    "#include[ \t]*[<\"]cmsis"
    "#include[ \t]*[<\"]FreeRTOS\\.h"
    "#include[ \t]*[<\"]task\\.h"
    "#include[ \t]*[<\"]semphr\\.h"
    "#include[ \t]*[<\"]queue\\.h"
    "#include[ \t]*[<\"]windows\\.h"
    "#include[ \t]*[<\"]unistd\\.h"
    "#include[ \t]*[<\"]sys/"
)

file(GLOB_RECURSE SOURCES
    "${CMAKE_CURRENT_LIST_DIR}/../include/*.h"
    "${CMAKE_CURRENT_LIST_DIR}/../include/*.hpp"
    "${CMAKE_CURRENT_LIST_DIR}/../src/*.cc"
    "${CMAKE_CURRENT_LIST_DIR}/../src/*.cpp"
    "${CMAKE_CURRENT_LIST_DIR}/../src/*.h"
)

set(VIOLATIONS "")
foreach(file IN LISTS SOURCES)
    file(STRINGS "${file}" lines)
    set(lineno 0)
    foreach(line IN LISTS lines)
        math(EXPR lineno "${lineno}+1")
        # Skip lines containing the explicit override comment.
        string(FIND "${line}" "HAL_LEAK_OVERRIDE" override_pos)
        if(NOT override_pos EQUAL -1)
            continue()
        endif()
        foreach(pattern IN LISTS BANNED_PATTERNS)
            string(REGEX MATCH "${pattern}" matched "${line}")
            if(matched)
                list(APPEND VIOLATIONS "  ${file}:${lineno}: ${line}")
            endif()
        endforeach()
    endforeach()
endforeach()

if(VIOLATIONS)
    message(STATUS "HAL leak L1 check: FAIL")
    foreach(v IN LISTS VIOLATIONS)
        message(STATUS "${v}")
    endforeach()
    message(FATAL_ERROR
        "gnc-core contains forbidden platform headers (Decision 13 Wave 1 L1).\n"
        "Either move the code to the appropriate wrapper (gnc-android / gnc-stm32 / gnc-backend),\n"
        "or annotate the line with: // HAL_LEAK_OVERRIDE: <justification>"
    )
else()
    message(STATUS "HAL leak L1 check: PASS (no forbidden includes)")
endif()
