// gnc-backend/src/hal/native/WindowsThermal.cc
// Windows-specific thermal monitoring using performance counters.

#include "WindowsThermal.h"

#ifdef _WIN32
#include <windows.h>
#include <pdh.h>
#pragma comment(lib, "pdh.lib")

#include <psapi.h>
#pragma comment(lib, "psapi.lib")
#endif

#include <cstdint>

namespace gnc::backend::hal::native {

#ifdef _WIN32
class PdhQuery {
public:
    PdhQuery() : query_(nullptr), counter_(nullptr) {
        if (PdhOpenQueryW(nullptr, 0, &query_) != ERROR_SUCCESS) {
            query_ = nullptr;
        }
    }

    ~PdhQuery() {
        if (counter_) {
            PdhRemoveCounter(counter_);
        }
        if (query_) {
            PdhCloseQuery(query_);
        }
    }

    bool add_counter(const wchar_t* path) {
        if (!query_) return false;
        return PdhAddEnglishCounterW(query_, path, 0, &counter_) == ERROR_SUCCESS;
    }

    double get_value() {
        if (!query_ || !counter_) return 0.0;

        PdhCollectQueryData(query_);
        PDH_FMT_COUNTERVALUE value;
        if (PdhGetFormattedCounterValue(counter_, PDH_FMT_DOUBLE, nullptr, &value) == ERROR_SUCCESS) {
            return value.doubleValue;
        }
        return 0.0;
    }

private:
    PDH_HQUERY query_;
    PDH_HCOUNTER counter_;
};
#endif

WindowsThermal::WindowsThermal()
{
#ifdef _WIN32
    // Initialize PDH query for CPU load
#endif
}

gnc::hal::ThermalSample WindowsThermal::sample()
{
    gnc::hal::ThermalSample s{};

#ifdef _WIN32
    static PdhQuery cpu_query;
    static bool initialized = false;

    if (!initialized) {
        cpu_query.add_counter(L"\\Processor(_Total)\\% Processor Time");
        initialized = true;
    }

    s.cpu_load_pct = cpu_query.get_value();

    // Get heap free from process
    PROCESS_MEMORY_COUNTERS_EX pmc;
    if (GetProcessMemoryInfo(GetCurrentProcess(), (PROCESS_MEMORY_COUNTERS*)&pmc, sizeof(pmc))) {
        MEMORYSTATUSEX ms = {};
        ms.dwLength = sizeof(ms);
        GlobalMemoryStatusEx(&ms);
        
        // Approximate heap free as available physical memory in KB
        s.heap_free_kb = static_cast<std::uint32_t>(ms.ullAvailPhys / 1024);
    }

    // CPU temperature - Windows doesn't provide a direct API
    // Would require WMI queries to specific hardware sensors
    // For now, set to a safe default
    s.cpu_temp_c = 45.0;  // Safe default temperature

    // Stack high water mark - Windows doesn't provide this directly
    s.stack_high_water_kb = 0;
#else
    // Non-Windows fallback
    s.cpu_temp_c = 35.0;
    s.cpu_load_pct = 0.0;
    s.heap_free_kb = 4096;
    s.stack_high_water_kb = 0;
#endif

    return s;
}

}  // namespace gnc::backend::hal::native
