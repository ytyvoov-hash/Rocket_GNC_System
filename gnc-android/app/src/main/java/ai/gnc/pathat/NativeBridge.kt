package ai.gnc.pathat

/**
 * v8 P5.2. Thin JVM handle over the native gnc-core GNC bridge (jni_glue.cc).
 * All GNC math runs in native code (no JVM heap on the hot path — see
 * docs/path_a_rt_suitability.md §4). The JVM only marshals raw frame payloads.
 */
class NativeBridge : AutoCloseable {
    private var handle: Long = 0

    init {
        System.loadLibrary("gnc-core-jni")
        handle = nativeCreate()
    }

    /**
     * Run one outer-loop step on a decoded SENSOR payload (from the L431) and
     * return the COMMAND payload to send back. Returns null on a malformed frame.
     */
    fun step(sensorPayload: ByteArray, armed: Boolean): ByteArray? =
        nativeStep(handle, sensorPayload, armed)

    override fun close() {
        if (handle != 0L) { nativeDestroy(handle); handle = 0 }
    }

    private external fun nativeCreate(): Long
    private external fun nativeStep(handle: Long, sensorPayload: ByteArray, armed: Boolean): ByteArray?
    private external fun nativeDestroy(handle: Long)
}
