// gnc-backend/src/hal/native/UsbScan.cc

#include "UsbScan.h"

#include "../../parser/YamlToJson.h"
#include "../../controllers/ConfigPaths.h"

#include <algorithm>
#include <atomic>
#include <cctype>
#include <filesystem>
#include <mutex>
#include <regex>
#include <unordered_map>

#ifdef _WIN32
#include <windows.h>
#include <setupapi.h>
#include <devguid.h>
#include <initguid.h>
#include <usbiodef.h>
#pragma comment(lib, "setupapi.lib")
#endif

namespace gnc::backend::hal::native {

namespace {

// (vid, pid) -> role id ("GPS_TLM_PL2303", etc.). Both keys are stored
// upper-case-with-0x-prefix so matching is exact.
struct RoleTable {
    std::unordered_map<std::string, std::string> by_vidpid;
    std::string unknown_role{"UNKNOWN"};
};

std::mutex          g_table_mu;
RoleTable           g_table;
std::atomic<bool>   g_table_loaded{false};

std::string upper_hex(std::string s)
{
    for (auto& c : s) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
    return s;
}

std::string make_key(const std::string& vid, const std::string& pid)
{
    return upper_hex(vid) + ":" + upper_hex(pid);
}

void parse_role_table_into(const nlohmann::json& doc, RoleTable& out)
{
    out = RoleTable{};
    if (!doc.is_object()) return;
    if (doc.contains("unknown_role") && doc["unknown_role"].is_string()) {
        out.unknown_role = doc["unknown_role"].get<std::string>();
    }
    if (!doc.contains("roles") || !doc["roles"].is_array()) return;

    for (const auto& role : doc["roles"]) {
        if (!role.is_object()) continue;
        const auto id = role.value("id", std::string{});
        if (id.empty()) continue;
        if (!role.contains("devices") || !role["devices"].is_array()) continue;
        for (const auto& d : role["devices"]) {
            const auto vid = d.value("vid", std::string{});
            const auto pid = d.value("pid", std::string{});
            if (vid.empty() || pid.empty()) continue;
            const auto key = make_key(vid, pid);
            // First role wins on conflict (CP2102 maps to EXT_IMU before
            // RUDDER_CP2102 in the canonical schema; mission-level decl
            // disambiguates downstream).
            out.by_vidpid.emplace(key, id);
        }
    }
}

void ensure_table_loaded()
{
    if (g_table_loaded.load(std::memory_order_acquire)) return;
    std::lock_guard<std::mutex> lock(g_table_mu);
    if (g_table_loaded.load(std::memory_order_relaxed)) return;

    // Resolve schemas root from config; default to ../schemas (relative
    // to the backend cwd which is gnc-backend/).
    std::filesystem::path schemas_root =
        gnc::backend::config_path("schemas_root", "../schemas");
    auto path = schemas_root / "android_usb_roles.schema.yaml";

    auto doc = parser::read_yaml_file(path.string());
    parse_role_table_into(doc, g_table);

    // Hard-coded fallbacks for IDs the FE knows about but that are not
    // present in the canonical YAML (e.g. Jetson Nano CarTrack). These
    // are required so the FE Routing Manager can offer the user the
    // matching role even on a fresh checkout.
    static const std::pair<std::string, std::string> kBuiltins[] = {
        {"0x0955:0x7020", "SEEK_CARTRACK"},
    };
    for (const auto& [key, role] : kBuiltins) {
        g_table.by_vidpid.emplace(key, role);
    }

    g_table_loaded.store(true, std::memory_order_release);
}

std::string lookup_role(const std::string& vid, const std::string& pid)
{
    ensure_table_loaded();
    std::lock_guard<std::mutex> lock(g_table_mu);
    auto it = g_table.by_vidpid.find(make_key(vid, pid));
    if (it != g_table.by_vidpid.end()) return it->second;
    return g_table.unknown_role;
}

#ifdef _WIN32
std::string registry_string(HDEVINFO dev_info, SP_DEVINFO_DATA& dev_data, DWORD prop)
{
    DWORD type = 0;
    DWORD bytes = 0;
    SetupDiGetDeviceRegistryPropertyW(dev_info, &dev_data, prop, &type,
                                      nullptr, 0, &bytes);
    if (bytes == 0) return {};
    std::vector<BYTE> buf(bytes);
    if (!SetupDiGetDeviceRegistryPropertyW(dev_info, &dev_data, prop, &type,
                                           buf.data(), bytes, nullptr)) {
        return {};
    }
    if (type != REG_SZ && type != REG_MULTI_SZ) return {};

    const auto* w = reinterpret_cast<wchar_t*>(buf.data());
    int needed = WideCharToMultiByte(CP_UTF8, 0, w, -1, nullptr, 0, nullptr, nullptr);
    if (needed <= 1) return {};
    std::string s(static_cast<std::size_t>(needed - 1), '\0');
    WideCharToMultiByte(CP_UTF8, 0, w, -1, s.data(), needed, nullptr, nullptr);
    return s;
}

// Pulls the COM port name (e.g. "COM7") out of FRIENDLYNAME which on
// Windows is formatted "<Description> (COMxx)". Returns empty if the
// device isn't a serial port.
std::string com_port_from_friendly(const std::string& friendly)
{
    static const std::regex re(R"(\(COM(\d+)\))");
    std::smatch m;
    if (std::regex_search(friendly, m, re)) {
        return "COM" + m[1].str();
    }
    return {};
}

// Strips the trailing " (COMxx)" so the human label is clean.
std::string strip_com_suffix(std::string friendly)
{
    static const std::regex re(R"(\s*\(COM\d+\)$)");
    return std::regex_replace(friendly, re, "");
}

bool parse_vid_pid(const std::string& hardware_id,
                   std::string& vid, std::string& pid)
{
    auto vp = hardware_id.find("VID_");
    auto pp = hardware_id.find("PID_");
    if (vp == std::string::npos || pp == std::string::npos) return false;
    if (vp + 8 > hardware_id.size() || pp + 8 > hardware_id.size()) return false;
    vid = "0x" + upper_hex(hardware_id.substr(vp + 4, 4));
    pid = "0x" + upper_hex(hardware_id.substr(pp + 4, 4));
    return true;
}

std::vector<ScannedPort> enumerate_windows()
{
    std::vector<ScannedPort> out;

    // Two passes: GUID_DEVINTERFACE_USB_DEVICE for raw USB enumeration,
    // and GUID_DEVCLASS_PORTS for the COM-port association. We index by
    // PNP-instance hardware-id so the two views can be joined.
    HDEVINFO dev_info = SetupDiGetClassDevsW(&GUID_DEVCLASS_PORTS,
                                             nullptr, nullptr, DIGCF_PRESENT);
    if (dev_info == INVALID_HANDLE_VALUE) return out;

    SP_DEVINFO_DATA data{};
    data.cbSize = sizeof(SP_DEVINFO_DATA);
    for (DWORD i = 0; SetupDiEnumDeviceInfo(dev_info, i, &data); ++i) {
        const auto hwid     = registry_string(dev_info, data, SPDRP_HARDWAREID);
        const auto friendly = registry_string(dev_info, data, SPDRP_FRIENDLYNAME);
        const auto desc     = registry_string(dev_info, data, SPDRP_DEVICEDESC);

        // Only USB-backed serial ports — skip native UARTs, virtual
        // bluetooth links, etc. They have no VID/PID and aren't part of
        // the routable USB inventory.
        std::string vid, pid;
        if (!parse_vid_pid(hwid, vid, pid)) continue;

        const auto com = com_port_from_friendly(friendly);
        if (com.empty()) continue;   // not a COM port, skip

        ScannedPort p;
        p.name           = strip_com_suffix(friendly.empty() ? desc : friendly);
        p.dev            = com;
        p.vid            = vid;
        p.pid            = pid;
        p.suggested_role = lookup_role(vid, pid);
        p.status         = "OK";
        p.rx_bps         = 0;
        p.tx_bps         = 0;
        out.push_back(std::move(p));
    }

    SetupDiDestroyDeviceInfoList(dev_info);

    // Stable ordering for deterministic FE renders.
    std::sort(out.begin(), out.end(),
              [](const ScannedPort& a, const ScannedPort& b) {
                  return a.dev < b.dev;
              });
    return out;
}
#endif  // _WIN32

}  // namespace

// ===========================================================================
// Public API
// ===========================================================================
void reload_role_table()
{
    g_table_loaded.store(false, std::memory_order_release);
    ensure_table_loaded();
}

void load_role_table(const std::string& path)
{
    auto doc = parser::read_yaml_file(path);
    std::lock_guard<std::mutex> lock(g_table_mu);
    parse_role_table_into(doc, g_table);
    g_table_loaded.store(true, std::memory_order_release);
}

std::vector<ScannedPort> enumerate_usb_serial_ports()
{
    ensure_table_loaded();
#ifdef _WIN32
    return enumerate_windows();
#else
    return {};
#endif
}

nlohmann::json to_wire_json(const std::vector<ScannedPort>& ports,
                            const nlohmann::json&            assignments)
{
    // Build a vidPid -> role lookup from the assignments file. Accepts
    // both `[{vidPid:"067B:2303", role:"..."}]` (array) and the
    // `{assignments:[...]}` envelope written by older clients.
    std::unordered_map<std::string, std::string> overrides;
    auto absorb = [&](const nlohmann::json& arr) {
        if (!arr.is_array()) return;
        for (const auto& a : arr) {
            if (!a.is_object()) continue;
            const auto vp   = a.value("vidPid", std::string{});
            const auto role = a.value("role",   std::string{});
            if (!vp.empty() && !role.empty()) overrides[upper_hex(vp)] = role;
        }
    };
    if (assignments.is_array()) {
        absorb(assignments);
    } else if (assignments.is_object()) {
        if (assignments.contains("assignments")) absorb(assignments["assignments"]);
    }

    nlohmann::json out = nlohmann::json::array();
    for (const auto& p : ports) {
        // Strip the 0x prefix to match the FE's "067B:2303" key style.
        auto strip = [](std::string s) {
            if (s.size() > 2 && s[0] == '0' && (s[1] == 'x' || s[1] == 'X')) s.erase(0, 2);
            return s;
        };
        const auto vid_no0x = strip(p.vid);
        const auto pid_no0x = strip(p.pid);
        const auto vp_key   = upper_hex(vid_no0x + ":" + pid_no0x);

        std::string assigned = p.suggested_role;
        if (auto it = overrides.find(vp_key); it != overrides.end()) {
            assigned = it->second;
        }

        out.push_back({
            {"name",          p.name},
            {"dev",           p.dev},
            {"vid",           vid_no0x},
            {"pid",           pid_no0x},
            {"suggestedRole", p.suggested_role},
            {"assignedRole",  assigned},
            {"rxBps",         p.rx_bps},
            {"txBps",         p.tx_bps},
            {"status",        p.status}
        });
    }
    return out;
}

}  // namespace gnc::backend::hal::native
