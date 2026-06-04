// gnc-android/Messages.cc — explicit little-endian (de)serialisation (v8 P5.2).
#include "gnc-android/Messages.h"

#include <cstring>

namespace gnc::android {
namespace {

// --- little-endian writers -------------------------------------------------
void put_u8(std::vector<std::uint8_t>& b, std::uint8_t v) { b.push_back(v); }

void put_u32(std::vector<std::uint8_t>& b, std::uint32_t v) {
    for (int i = 0; i < 4; ++i) b.push_back(static_cast<std::uint8_t>(v >> (8 * i)));
}

void put_i64(std::vector<std::uint8_t>& b, std::int64_t v) {
    auto u = static_cast<std::uint64_t>(v);
    for (int i = 0; i < 8; ++i) b.push_back(static_cast<std::uint8_t>(u >> (8 * i)));
}

void put_f32(std::vector<std::uint8_t>& b, float v) {
    std::uint32_t u;
    std::memcpy(&u, &v, 4);
    for (int i = 0; i < 4; ++i) b.push_back(static_cast<std::uint8_t>(u >> (8 * i)));
}

void put_f64(std::vector<std::uint8_t>& b, double v) {
    std::uint64_t u;
    std::memcpy(&u, &v, 8);
    for (int i = 0; i < 8; ++i) b.push_back(static_cast<std::uint8_t>(u >> (8 * i)));
}

// --- little-endian readers (cursor advanced by ref) ------------------------
std::uint32_t get_u32(const std::uint8_t* p, std::size_t& c) {
    std::uint32_t v = 0;
    for (int i = 0; i < 4; ++i) v |= static_cast<std::uint32_t>(p[c++]) << (8 * i);
    return v;
}

std::int64_t get_i64(const std::uint8_t* p, std::size_t& c) {
    std::uint64_t v = 0;
    for (int i = 0; i < 8; ++i) v |= static_cast<std::uint64_t>(p[c++]) << (8 * i);
    return static_cast<std::int64_t>(v);
}

float get_f32(const std::uint8_t* p, std::size_t& c) {
    std::uint32_t u = 0;
    for (int i = 0; i < 4; ++i) u |= static_cast<std::uint32_t>(p[c++]) << (8 * i);
    float v;
    std::memcpy(&v, &u, 4);
    return v;
}

double get_f64(const std::uint8_t* p, std::size_t& c) {
    std::uint64_t u = 0;
    for (int i = 0; i < 8; ++i) u |= static_cast<std::uint64_t>(p[c++]) << (8 * i);
    double v;
    std::memcpy(&v, &u, 8);
    return v;
}

constexpr std::size_t kSensorBytes = 8 + 12 + 12 + 24 + 12 + 1 + 1;  // = 70
constexpr std::size_t kCommandBytes = 1 + 16 + 12 + 1;               // = 30
constexpr std::size_t kHeartbeatBytes = 4 + 1;                       // = 5

}  // namespace

std::vector<std::uint8_t> SensorMsg::serialize() const {
    std::vector<std::uint8_t> b;
    b.reserve(kSensorBytes);
    put_i64(b, t_ns);
    for (float v : acc_b) put_f32(b, v);
    for (float v : gyro_b) put_f32(b, v);
    put_f64(b, lat); put_f64(b, lon); put_f64(b, alt);
    for (float v : vel_n) put_f32(b, v);
    put_u8(b, gps_valid);
    put_u8(b, imu_valid);
    return b;
}

bool SensorMsg::deserialize(const std::uint8_t* p, std::size_t n, SensorMsg& out) {
    if (n != kSensorBytes) return false;
    std::size_t c = 0;
    out.t_ns = get_i64(p, c);
    for (float& v : out.acc_b) v = get_f32(p, c);
    for (float& v : out.gyro_b) v = get_f32(p, c);
    out.lat = get_f64(p, c); out.lon = get_f64(p, c); out.alt = get_f64(p, c);
    for (float& v : out.vel_n) v = get_f32(p, c);
    out.gps_valid = p[c++];
    out.imu_valid = p[c++];
    return c == n;
}

std::vector<std::uint8_t> CommandMsg::serialize() const {
    std::vector<std::uint8_t> b;
    b.reserve(kCommandBytes);
    put_u8(b, n_fins);
    for (float v : fin_cmd_rad) put_f32(b, v);
    for (float v : target_euler) put_f32(b, v);
    put_u8(b, mode);
    return b;
}

bool CommandMsg::deserialize(const std::uint8_t* p, std::size_t n, CommandMsg& out) {
    if (n != kCommandBytes) return false;
    std::size_t c = 0;
    out.n_fins = p[c++];
    for (float& v : out.fin_cmd_rad) v = get_f32(p, c);
    for (float& v : out.target_euler) v = get_f32(p, c);
    out.mode = p[c++];
    return c == n;
}

std::vector<std::uint8_t> HeartbeatMsg::serialize() const {
    std::vector<std::uint8_t> b;
    b.reserve(kHeartbeatBytes);
    put_u32(b, seq);
    put_u8(b, state);
    return b;
}

bool HeartbeatMsg::deserialize(const std::uint8_t* p, std::size_t n, HeartbeatMsg& out) {
    if (n != kHeartbeatBytes) return false;
    std::size_t c = 0;
    out.seq = get_u32(p, c);
    out.state = p[c++];
    return c == n;
}

}  // namespace gnc::android
