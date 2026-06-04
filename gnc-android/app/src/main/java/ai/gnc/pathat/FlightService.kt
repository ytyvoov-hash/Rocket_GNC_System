package ai.gnc.pathat

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.PowerManager
import java.util.concurrent.atomic.AtomicBoolean

/**
 * v8 P5.2. Foreground service that owns the Path A GNC thread and the USB-CDC
 * link to the STM32L431. Per docs/path_a_rt_suitability.md, this is the
 * SOFT-RT outer loop (sensor fusion + guidance, ~10–50 Hz); the hard-RT inner
 * loop stays on the L431, which safes itself on heartbeat loss regardless of
 * this process.
 *
 * Skeleton only: the USB transport binding (UsbManager / accessory) and the
 * foreground notification are intentionally minimal — this proves the substrate
 * exists and wires native ↔ link ↔ UI. Hardening (wakelock policy, core pinning
 * via a privileged helper, Doze opt-out) is listed in the RT analysis §4.
 */
class FlightService : Service() {

    private val running = AtomicBoolean(false)
    private var wakeLock: PowerManager.WakeLock? = null
    private var thread: Thread? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (running.compareAndSet(false, true)) {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "gnc:pathA").apply { acquire() }
            thread = Thread(::loop, "gnc-outer-loop").apply { priority = Thread.MAX_PRIORITY; start() }
        }
        return START_STICKY
    }

    /** Outer loop: read framed SENSOR from the link, run native step, send COMMAND. */
    private fun loop() {
        NativeBridge().use { bridge ->
            val link = UsbCdcTransport(this)   // binds the USB-CDC device
            val armed = false                  // relayed from LaunchAuthority (server, P0.2)
            while (running.get()) {
                val sensorPayload = link.readSensorPayload() ?: continue
                val command = bridge.step(sensorPayload, armed) ?: continue
                link.writeCommandPayload(command)
            }
        }
    }

    override fun onDestroy() {
        running.set(false)
        thread?.join(500)
        wakeLock?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }
}
