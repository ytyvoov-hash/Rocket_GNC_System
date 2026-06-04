package ai.gnc.pathat

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * v8 P5.2 (skeleton). Minimal operator surface: start/stop the Path A flight
 * service and show a telemetry line. Authority to ARM/LAUNCH remains
 * server-side (gnc-backend LaunchAuthority, P0.2); this UI only relays intent
 * and displays state — it does not self-authorise.
 */
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val status = TextView(this).apply { text = "Path A: idle" }
        val start = Button(this).apply {
            text = "Start GNC outer loop"
            setOnClickListener {
                startService(Intent(this@MainActivity, FlightService::class.java))
                status.text = "Path A: running (outer loop)"
            }
        }
        val stop = Button(this).apply {
            text = "Stop"
            setOnClickListener {
                stopService(Intent(this@MainActivity, FlightService::class.java))
                status.text = "Path A: idle"
            }
        }
        root.addView(status); root.addView(start); root.addView(stop)
        setContentView(root)
    }
}
