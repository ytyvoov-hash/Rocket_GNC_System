// gnc-android/jni_glue.cc
//
// v8 P5.2. JNI surface for the Kotlin app. Compiled ONLY for the Android target
// (-DGNC_ANDROID_JNI, NDK build) — it includes <jni.h> from the NDK. The host
// build and unit tests exclude this file and exercise GncBridge / UsbCdcLink
// directly.
//
// The JVM side (FlightService.kt) owns the USB connection and the GNC thread;
// it hands raw sensor-frame payloads to native, gets back command-frame
// payloads, and reads telemetry. No GNC math runs on the JVM heap (RT analysis
// §4: keep the hot path off ART/GC).

#ifdef GNC_ANDROID_JNI

#include "gnc-android/GncBridge.h"
#include "gnc-android/AndroidClock.h"
#include "gnc-core/control/ControllerFactory.h"

#include <jni.h>

#include <memory>

using gnc::android::BridgeConfig;
using gnc::android::CommandMsg;
using gnc::android::GncBridge;
using gnc::android::SensorMsg;

namespace {

GncBridge* as_bridge(jlong h) { return reinterpret_cast<GncBridge*>(h); }

}  // namespace

extern "C" {

JNIEXPORT jlong JNICALL
Java_ai_gnc_pathat_NativeBridge_nativeCreate(JNIEnv*, jobject) {
    gnc::android::register_android_clock();

    gnc::TuningParams tp;
    tp.algorithm = "PID";
    tp.controller_type = "fins";
    tp.kp = 4.0; tp.ki = 0.0; tp.kd = 2.0;
    tp.n_fins = 4; tp.fin_layout = "cruciform";
    tp.Cm_delta = 0.5; tp.Cn_delta = 0.5; tp.Cl_delta = 0.01;
    auto [ctrl, alloc] = gnc::control::ControllerFactory::create(tp);

    return reinterpret_cast<jlong>(new GncBridge(BridgeConfig{}, ctrl, alloc));
}

JNIEXPORT jbyteArray JNICALL
Java_ai_gnc_pathat_NativeBridge_nativeStep(JNIEnv* env, jobject, jlong h,
                                           jbyteArray sensorPayload, jboolean armed) {
    GncBridge* b = as_bridge(h);
    if (b == nullptr) return nullptr;

    const jsize n = env->GetArrayLength(sensorPayload);
    std::vector<std::uint8_t> in(static_cast<std::size_t>(n));
    env->GetByteArrayRegion(sensorPayload, 0, n, reinterpret_cast<jbyte*>(in.data()));

    SensorMsg s;
    if (!SensorMsg::deserialize(in.data(), in.size(), s)) return nullptr;

    const CommandMsg cmd = b->step(s, armed == JNI_TRUE);
    const std::vector<std::uint8_t> out = cmd.serialize();

    jbyteArray arr = env->NewByteArray(static_cast<jsize>(out.size()));
    env->SetByteArrayRegion(arr, 0, static_cast<jsize>(out.size()),
                            reinterpret_cast<const jbyte*>(out.data()));
    return arr;
}

JNIEXPORT void JNICALL
Java_ai_gnc_pathat_NativeBridge_nativeDestroy(JNIEnv*, jobject, jlong h) {
    delete as_bridge(h);
}

}  // extern "C"

#endif  // GNC_ANDROID_JNI
