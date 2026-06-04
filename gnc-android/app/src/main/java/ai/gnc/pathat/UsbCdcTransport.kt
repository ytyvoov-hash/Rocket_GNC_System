package ai.gnc.pathat

import android.content.Context

/**
 * v8 P5.2 (skeleton). USB-CDC transport binding for the L431 link. The wire
 * framing + CRC + message layout live in native code (gnc-android/native:
 * UsbCdcLink / Messages) so the protocol is identical on the phone and the
 * peripheral and is unit-tested on the host.
 *
 * This Kotlin shim is the place the Android USB host API (UsbManager,
 * UsbDeviceConnection, bulk transfer on the CDC-ACM endpoints) is wired in.
 * Left as a documented stub: hardware bring-up + USB permission flow is a HIL
 * task, out of scope for the spike. The methods return the raw DEFRAMED
 * SENSOR / framed COMMAND payloads that NativeBridge consumes/produces.
 */
class UsbCdcTransport(private val context: Context) {

    /** Block for and return the next decoded SENSOR payload, or null on timeout. */
    fun readSensorPayload(): ByteArray? {
        // TODO(HIL): UsbManager.openDevice(...).bulkTransfer(inEndpoint, ...)
        //            then feed bytes to the native UsbCdcLink framer.
        return null
    }

    /** Send a framed COMMAND payload to the L431. */
    fun writeCommandPayload(payload: ByteArray) {
        // TODO(HIL): bulkTransfer(outEndpoint, framed, ...)
    }
}
