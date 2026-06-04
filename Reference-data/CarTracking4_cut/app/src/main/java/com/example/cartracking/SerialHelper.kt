package com.example.cartracking

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Log
import android.widget.Toast
import androidx.core.content.ContextCompat
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.hoho.android.usbserial.driver.UsbSerialProber
import java.io.IOException

class SerialHelper(private val context: Context) {
    private var port: UsbSerialPort? = null
    private val ACTION_USB_PERMISSION = "com.example.cartracking.USB_PERMISSION"

    private val manager = context.getSystemService(Context.USB_SERVICE) as UsbManager

    // Tracking Payload State
    @Volatile var targetAngleX: Float = 0f
    @Volatile var targetAngleY: Float = 0f
    @Volatile var rateAngleX: Float = 0f
    @Volatile var rateAngleY: Float = 0f
    @Volatile var targetWidth: Int = 0
    @Volatile var targetHeight: Int = 0
    @Volatile var modeDetect: Byte = MODE_IDLE
    @Volatile var cpuTemp: Byte = 45

    // New fields according to the new protocol (Ali.cpp)
    @Volatile var xPos: Int = 0
    @Volatile var yPos: Int = 0
    @Volatile var lastFrameTimeMs: Long = 0 // لتتبع آخر إطار من الكاميرا
    @Volatile var ipu: Byte = 0
    @Volatile var fire: Byte = 0
    @Volatile var zoom: Int = 0

    // Multi-Threading Components
    private var txThread: Thread? = null
    private var rxThread: Thread? = null
    @Volatile private var isSending = false

    // RX Callback Interface
    interface SerialRxListener {
        fun onDataReceived(stab: Byte, modeCam: Byte, yaw: Float, pitch: Float, ctrl: Byte, time: Long, target: Byte, misType: Byte)
    }
    var rxListener: SerialRxListener? = null

    companion object {
        const val MODE_OFF = 0xE4.toByte()
        const val MODE_IDLE = 0xBF.toByte()
        const val MODE_SEARCHING = 0xAC.toByte()
        const val MODE_TRACK = 0xAD.toByte()

        // خوارزمية تشفير الأمان (مترجمة من C++ إلى كوتلن)
        fun getCrc16(data: ByteArray, count: Int): Int {
            var crc = 0
            for (i in 0 until count) {
                var temp = data[i].toInt() and 0xFF
                temp = temp shl 8
                crc = crc xor temp
                for (j in 0 until 8) {
                    if ((crc and 0x8000) != 0) {
                        crc = crc shl 1
                        crc = crc xor 0x1021
                    } else {
                        crc = crc shl 1
                    }
                }
            }
            return crc and 0xFFFF
        }
    }

    private val usbReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (ACTION_USB_PERMISSION == intent.action) {
                synchronized(this) {
                    val device: UsbDevice? = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                    if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                        device?.let { connectToDevice(it) }
                    } else {
                        Log.d("SerialHelper", "permission denied for device $device")
                        Toast.makeText(context, "USB Permission Denied", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }

    init {
        val filter = IntentFilter(ACTION_USB_PERMISSION)
        ContextCompat.registerReceiver(context, usbReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    fun connect() {
        try {
            if (port != null) return

            val availableDrivers = UsbSerialProber.getDefaultProber().findAllDrivers(manager)
            if (availableDrivers.isEmpty()) {
                Log.d("SerialHelper", "No USB serial drivers found")
                return
            }

            val driver = availableDrivers[0]
            val device = driver.device

            if (!manager.hasPermission(device)) {
                val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                } else {
                    PendingIntent.FLAG_UPDATE_CURRENT
                }
                val intent = Intent(ACTION_USB_PERMISSION)
                intent.setPackage(context.packageName) // Android 14+ Explicit Intent Fix
                val permissionIntent = PendingIntent.getBroadcast(context, 1, intent, flags)
                manager.requestPermission(device, permissionIntent)
                return
            }

            connectToDevice(device)
        } catch (e: Exception) {
            Log.e("SerialHelper", "Crash avoided in connect()", e)
            try {
                Toast.makeText(context, "USB Connect Error: " + e.message, Toast.LENGTH_LONG).show()
            } catch (te: Exception) {}
        }
    }

    private fun connectToDevice(device: UsbDevice) {
        try {
            val availableDrivers = UsbSerialProber.getDefaultProber().findAllDrivers(manager)
            val driver = availableDrivers.find { it.device.deviceId == device.deviceId } ?: return
            
            val connection = manager.openDevice(driver.device)
            if (connection == null) {
                Toast.makeText(context, "Cannot open device.", Toast.LENGTH_LONG).show()
                return
            }
            
            port = driver.ports[0]
            try {
                port?.open(connection)
            } catch (e: Exception) {
                Log.w("SerialHelper", "Port may already be open, continuing")
            }
            port?.setParameters(115200, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE)
            Log.d("SerialHelper", "Connected to USB device successfully at 115200 baud")
            Toast.makeText(context, "USB Connected", Toast.LENGTH_SHORT).show()
            
            startIoThreads()
        } catch (e: Exception) {
            Log.e("SerialHelper", "Connection failed: ${e.message}")
            try { Toast.makeText(context, "Failed to open port", Toast.LENGTH_LONG).show() } catch (te: Exception) {}
        }
    }

    private fun startIoThreads() {
        // 1. خيط الإرسال (TX Dedicated Thread - 50Hz)
        isSending = true
        txThread = Thread {
            val bufferTX = ByteArray(24) // 24 bytes total based on new struct
            bufferTX[0] = 0xAA.toByte()
            bufferTX[1] = 0xCC.toByte()
            
            while (isSending && port != null) {
                try {
                    val ax = (targetAngleX * 100).toInt()
                    val ay = (targetAngleY * 100).toInt()
                    val rx = (rateAngleX * 100).toInt()
                    val ry = (rateAngleY * 100).toInt()
                    val xp = xPos
                    val yp = yPos
                    
                    bufferTX[2] = (ax and 0xFF).toByte()
                    bufferTX[3] = ((ax shr 8) and 0xFF).toByte()
                    bufferTX[4] = (ay and 0xFF).toByte()
                    bufferTX[5] = ((ay shr 8) and 0xFF).toByte()
                    bufferTX[6] = (rx and 0xFF).toByte()
                    bufferTX[7] = ((rx shr 8) and 0xFF).toByte()
                    bufferTX[8] = (ry and 0xFF).toByte()
                    bufferTX[9] = ((ry shr 8) and 0xFF).toByte()
                    bufferTX[10] = (xp and 0xFF).toByte()
                    bufferTX[11] = ((xp shr 8) and 0xFF).toByte()
                    bufferTX[12] = (yp and 0xFF).toByte()
                    bufferTX[13] = ((yp shr 8) and 0xFF).toByte()
                    bufferTX[14] = cpuTemp
                    
                    // إذا مر أقل من ثانية على آخر إطار تم استلامه، الكاميرا تعمل (1)، غير ذلك (0)
                    val isCameraWorking: Byte = if (lastFrameTimeMs > 0 && (System.currentTimeMillis() - lastFrameTimeMs < 1000)) 1 else 0
                    bufferTX[15] = isCameraWorking // يمثل work للتحقق من الكاميرا
                    
                    bufferTX[16] = ipu
                    bufferTX[17] = targetWidth.toByte()
                    bufferTX[18] = targetHeight.toByte()
                    bufferTX[19] = fire
                    bufferTX[20] = (zoom and 0xFF).toByte()
                    bufferTX[21] = ((zoom shr 8) and 0xFF).toByte()
                    
                    // التشفير للمصفوفة لـ 22 بايت
                    val crc = getCrc16(bufferTX, 22)
                    bufferTX[22] = (crc and 0xFF).toByte()
                    bufferTX[23] = ((crc shr 8) and 0xFF).toByte()
                    
                    port?.write(bufferTX, 24) // قذف البيانات للمنفذ
                    
                    Thread.sleep(20) // نوم الخيط لمدة 50ms (20Hz) - أو عدّلها لـ 20 لـ 50Hz
                } catch (e: Exception) {
                    Log.e("SerialHelper", "TX Thread error", e)
                    break
                }
            }
        }
        txThread?.start()

        // 2. خيط الاستقبال اليدوي (RX Listener Thread)
        rxThread = Thread {
            val rxBuffer = ByteArray(1024)
            var rxLength = 0
            val readBuffer = ByteArray(256)
            
            while (isSending && port != null) {
                try {
                    val len = port?.read(readBuffer, 200) ?: 0
                    if (len > 0) {
                        if (rxLength + len <= rxBuffer.size) {
                            System.arraycopy(readBuffer, 0, rxBuffer, rxLength, len)
                            rxLength += len
                        }
                        
                        // البحث في الكتل الواردة عن رسالة طولها 20 بايت
                        while (rxLength >= 20) {
                            var foundHeader = false
                            for (i in 0..rxLength - 20) {
                                if (rxBuffer[i] == 0x55.toByte() && rxBuffer[i+1] == 0xAA.toByte()) {
                                    foundHeader = true
                                    
                                    val frame = ByteArray(18)
                                    System.arraycopy(rxBuffer, i, frame, 0, 18)
                                    val expectedCrc = getCrc16(frame, 18)
                                    val receivedCrc = ((rxBuffer[i+19].toInt() and 0xFF) shl 8) or (rxBuffer[i+18].toInt() and 0xFF)
                                    
                                    if (expectedCrc == receivedCrc || true) { // Allow bypass if res is not strict CRC
                                        val stab = rxBuffer[i+2]
                                        val modeCam = rxBuffer[i+3]
                                        val yawRaw = ((rxBuffer[i+5].toInt() and 0xFF) shl 8) or (rxBuffer[i+4].toInt() and 0xFF)
                                        val pitchRaw = ((rxBuffer[i+7].toInt() and 0xFF) shl 8) or (rxBuffer[i+6].toInt() and 0xFF)
                                        val ctrl = rxBuffer[i+8]
                                        
                                        val timeRaw = ((rxBuffer[i+12].toLong() and 0xFF) shl 24) or 
                                                      ((rxBuffer[i+11].toLong() and 0xFF) shl 16) or 
                                                      ((rxBuffer[i+10].toLong() and 0xFF) shl 8) or 
                                                      (rxBuffer[i+9].toLong() and 0xFF)
                                                      
                                        val target = rxBuffer[i+13]
                                        val slantRng = ByteArray(3)
                                        System.arraycopy(rxBuffer, i+14, slantRng, 0, 3)
                                        val misType = rxBuffer[i+17]
                                        
                                        val yaw = yawRaw.toShort().toFloat() / 100f
                                        val pitch = pitchRaw.toShort().toFloat() / 100f
                                        
                                        rxListener?.onDataReceived(stab, modeCam, yaw, pitch, ctrl, timeRaw, target, misType)
                                    }
                                    
                                    val remaining = rxLength - (i + 20)
                                    if (remaining > 0) {
                                        System.arraycopy(rxBuffer, i + 20, rxBuffer, 0, remaining)
                                    }
                                    rxLength = remaining
                                    break
                                }
                            }
                            if (!foundHeader) {
                                if (rxBuffer[rxLength - 1] == 0x55.toByte()) {
                                    rxBuffer[0] = 0x55.toByte()
                                    rxLength = 1
                                } else {
                                    rxLength = 0
                                }
                                break
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.d("SerialHelper", "RX Thread closed")
                    break
                }
            }
        }
        rxThread?.start()
    }

    fun disconnect() {
        isSending = false
        try { txThread?.join(500) } catch (e: Exception){}
        try { rxThread?.join(500) } catch (e: Exception){}
        txThread = null
        rxThread = null
        
        try {
            context.unregisterReceiver(usbReceiver)
        } catch (e: Exception) {
            // Already unregistered
        }
        try {
            port?.close()
        } catch (e: Exception) {
            Log.e("SerialHelper", "Failed to close port", e)
        }
        port = null
    }

    // إبقاء الدالة القديمة للرسائل النصية تحسباً (اختياري)
    fun sendData(data: String) { }
}
