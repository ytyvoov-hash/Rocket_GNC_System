# Building `gnc-core-jni` for the Android target (NDK)

The host build (`gnc-android/CMakeLists.txt`, default) compiles and unit-tests
the Path A native substrate — link protocol, clock, GNC bridge — on a developer
machine and in CI. The NDK is **not** required for that and is not present in
this repo's CI env.

To produce the on-device shared library `libgnc-core-jni.so` (loaded by
`NativeBridge.kt` via `System.loadLibrary("gnc-core-jni")`), build with the NDK
toolchain and the JNI option enabled:

```bash
cmake -S gnc-android -B build-android \
  -DCMAKE_TOOLCHAIN_FILE=$ANDROID_NDK/build/cmake/android.toolchain.cmake \
  -DANDROID_ABI=arm64-v8a \
  -DANDROID_PLATFORM=android-28 \
  -DGNC_ANDROID_JNI=ON
cmake --build build-android
```

This compiles `native/src/jni_glue.cc` (which needs `<jni.h>` from the NDK) and
links it with `gnc-android-app` + `gnc-core` into `libgnc-core-jni.so`. The
Gradle app module (`app/`) is expected to be assembled by the standard Android
toolchain (Gradle + AGP), placing the `.so` under `jniLibs/<abi>/`.

Eigen (used by `gnc-core`) is vendored at
`gnc-core/third_party/casadi/include/eigen3` and is header-only, so it
cross-compiles unchanged.
