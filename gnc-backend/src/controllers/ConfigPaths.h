// gnc-backend/src/controllers/ConfigPaths.h
// Tiny helper for reading paths out of the Drogon custom_config block.
// Centralised so every controller resolves rockets_root / library files
// the same way.

#pragma once

#include <drogon/drogon.h>

#include <filesystem>
#include <string>

namespace gnc::backend {

inline std::string config_path(const std::string& key,
                               const std::string& fallback)
{
    auto& custom = drogon::app().getCustomConfig();
    if (custom.isMember(key)) return custom[key].asString();
    return fallback;
}

inline std::filesystem::path rockets_root()
{
    return std::filesystem::path(config_path("rockets_root", "../rockets"));
}

inline std::string active_rocket_id()
{
    return config_path("active_rocket_id", "BA");
}

inline std::filesystem::path device_assignments_path()
{
    return std::filesystem::path(config_path("device_assignments", "./var/gnc_device_assignments.json"));
}

}  // namespace gnc::backend
