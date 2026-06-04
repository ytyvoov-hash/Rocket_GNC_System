package com.example.cartracking

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.widget.Toast
import android.net.Uri
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.example.cartracking.databinding.ActivityMainBinding
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity(), YoloDetector.DetectorListener {

    private lateinit var binding: ActivityMainBinding
    private var cameraHelper: CameraHelper? = null
    private var yoloDetector: YoloDetector? = null
    private var serialHelper: SerialHelper? = null
    private var shouldDetect = false

    private val detectHandler = Handler(Looper.getMainLooper())

    @Volatile
    private var latestFrameRgb: ByteArray? = null

    @Volatile
    private var latestFrameWidth: Int = 0

    @Volatile
    private var latestFrameHeight: Int = 0

    // لقطة فورية لبيانات القص وقت أخذ الفريم – يستخدمها transformBoxesToPreviewSpace
    @Volatile private var inferCropRect: android.graphics.Rect = android.graphics.Rect(0, 0, 640, 640)
    @Volatile private var inferRotDeg: Int = 90
    @Volatile private var inferSensorW: Int = 1920
    @Volatile private var inferSensorH: Int = 1080

    @Volatile
    private var cameraFps: Int = 0
    private var fpsFrameCount: Int = 0
    private var fpsLastTime: Long = System.currentTimeMillis()

    @Volatile
    private var detectFps: Int = 0
    private var detectFpsCount: Int = 0
    private var detectFpsLastTime: Long = System.currentTimeMillis()

    @Volatile
    private var isDetecting = false
    
    private var lastFireState = 0
    private var lastCtrlCmd = 0

    private val inferenceExecutor: ExecutorService = Executors.newSingleThreadExecutor()

    @Volatile
    private var currentMinConfidence = 0.65f

    @Volatile
    private var currentMinArea = 0.00034f

    private data class TrackPoint(
        val cxPx: Int,
        val cyPx: Int,
        val wPx: Int,
        val hPx: Int,
        val cls: Int,
        val clsName: String,
        val cnf: Float
    )

    private data class Track(
        val history: ArrayDeque<TrackPoint> = ArrayDeque(),
        var updatedThisFrame: Boolean = false,
        var misses: Int = 0
    )

    private val tracks: MutableList<Track> = mutableListOf()

    @Volatile
    private var primaryTargetCx: Float = -1f
    @Volatile
    private var primaryTargetCy: Float = -1f

    // عداد الفريمات الفاشلة في وضع التتبع (miss counter)
    private var trackMissCount: Int = 0
    private val TRACK_MAX_MISS = 15   // بعد 15 فريم بدون هدف → رجوع للبحث

    private val darkFrameLumaThreshold = 28
    private val lowContrastStdThreshold = 6

    private val dimFrameLumaThreshold = 90
    private val dimFrameStdThreshold = 18

    private val detectRunnable = object : Runnable {
        override fun run() {
            if (!shouldDetect) return
            scheduleNextInference()
        }
    }

    private var frameCounter = 0

    private fun scheduleNextInference() {
        if (!shouldDetect) return
        val frame = latestFrameRgb
        if (frame == null || isDetecting) {
            detectHandler.postDelayed({ scheduleNextInference() }, 2L)
            return
        }
        frameCounter++
        if (frameCounter % 10 == 0) {
            val veryDark = isFrameVeryDark(frame, latestFrameWidth, latestFrameHeight)
            if (veryDark) {
                runOnUiThread { binding.overlayView.setResults(emptyList()) }
                detectHandler.postDelayed({ scheduleNextInference() }, 100L)
                return
            }
            val stats = estimateFrameStats(frame, latestFrameWidth, latestFrameHeight)
            val dim = stats != null && (stats.avg < dimFrameLumaThreshold || stats.std < dimFrameStdThreshold)
            currentMinConfidence = 0.3f
            currentMinArea = 0.00034f   // ثابت، لا يتغير حسب الإضاءة     // 0.3% و 0.2% من مساحة الصورة (حوالي 1200-2000 بكسل)
        }
        isDetecting = true
        submitOneInference()
    }

    private fun submitOneInference() {
        val frame = latestFrameRgb ?: run {
            isDetecting = false
            return
        }
        val w = latestFrameWidth
        val h = latestFrameHeight
        // ✔لقط crop/rotation في نفس اللحظة التي أخذنا فيها الفريم – تحميه من التغيير أثناء معالجة YOLO
        cameraHelper?.let { ch ->
            inferCropRect  = ch.lastCropRect
            inferRotDeg    = ch.lastRotationDegrees
            inferSensorW   = ch.lastSensorWidth
            inferSensorH   = ch.lastSensorHeight
        }

        inferenceExecutor.execute {
            try {
                yoloDetector?.detectRgb(frame, w, h)
            } catch (t: Throwable) {
                Log.e("MainActivity", "Inference failed", t)
                onEmptyDetect()
            }
        }
    }

    private fun updateTracksAndSelectTargets(
        detections: List<YoloDetector.BoundingBox>,
        imgW: Int,
        imgH: Int
    ): List<YoloDetector.BoundingBox> {
        for (t in tracks) t.updatedThisFrame = false

        val allCoords = detections.mapNotNull { box ->
            val x1 = (box.x1 * imgW).toInt()
            val y1 = (box.y1 * imgH).toInt()
            val x2 = (box.x2 * imgW).toInt()
            val y2 = (box.y2 * imgH).toInt()
            val w = (x2 - x1).coerceAtLeast(0)
            val h = (y2 - y1).coerceAtLeast(0)
            if (w <= 1 || h <= 5) return@mapNotNull null
            val cx = x1 + w / 2
            val cy = y1 + h / 2
            if (cx <= 10 || cx >= imgW || cy <= 10 || cy >= imgH) return@mapNotNull null
            TrackPoint(cxPx = cx, cyPx = cy, wPx = w, hPx = h, cls = box.cls, clsName = box.clsName, cnf = box.cnf)
        }

        val targets = mutableListOf<TrackPoint>()
        for (p in allCoords) {
            var matched = false
            for (t in tracks) {
                if (t.updatedThisFrame) continue
                val last = t.history.lastOrNull() ?: continue
                val nearX = (p.cxPx >= last.cxPx - (imgW / 6)) && (p.cxPx <= last.cxPx + (imgW / 6))
                val nearY = (p.cyPx >= last.cyPx - (imgH / 6)) && (p.cyPx <= last.cyPx + (imgH / 6))
                if (nearX && nearY) {
                    if (t.history.size >= 100) t.history.removeFirst()
                    t.history.addLast(p)
                    t.updatedThisFrame = true
                    t.misses = 0
                    targets.add(p)
                    matched = true
                    break
                }
            }
            if (!matched && tracks.size < 100) {
                val tr = Track()
                tr.history.addLast(p)
                tr.updatedThisFrame = true
                tr.misses = 0
                tracks.add(tr)
                targets.add(p)
            }
        }

        val it = tracks.iterator()
        while (it.hasNext()) {
            val t = it.next()
            if (t.updatedThisFrame) {
                t.updatedThisFrame = false
            } else {
                t.misses += 1
                if (t.misses > 3) {
                    it.remove()
                } else {
                    val last = t.history.lastOrNull()
                    if (last != null) targets.add(last)
                }
            }
        }

        val deduped = mutableListOf<TrackPoint>()
        for (tp in targets) {
            val dominated = deduped.any { existing ->
                if (existing.cls != tp.cls) return@any false
                val ox1 = maxOf(existing.cxPx - existing.wPx / 2, tp.cxPx - tp.wPx / 2)
                val oy1 = maxOf(existing.cyPx - existing.hPx / 2, tp.cyPx - tp.hPx / 2)
                val ox2 = minOf(existing.cxPx + existing.wPx / 2, tp.cxPx + tp.wPx / 2)
                val oy2 = minOf(existing.cyPx + existing.hPx / 2, tp.cyPx + tp.hPx / 2)
                val inter = maxOf(0, ox2 - ox1) * maxOf(0, oy2 - oy1)
                val areaA = existing.wPx * existing.hPx
                val areaB = tp.wPx * tp.hPx
                val union = areaA + areaB - inter
                if (union > 0 && inter.toFloat() / union > 0.3f) return@any true
                val dx = (existing.cxPx - tp.cxPx).toFloat()
                val dy = (existing.cyPx - tp.cyPx).toFloat()
                val dist = kotlin.math.sqrt(dx * dx + dy * dy)
                val maxDiag = maxOf(
                    kotlin.math.sqrt((existing.wPx * existing.wPx + existing.hPx * existing.hPx).toFloat()),
                    kotlin.math.sqrt((tp.wPx * tp.wPx + tp.hPx * tp.hPx).toFloat())
                )
                dist < maxDiag * 0.5f
            }
            if (!dominated) deduped.add(tp)
        }

        return deduped.map { tp ->
            val x1 = ((tp.cxPx - tp.wPx / 2).toFloat() / imgW.toFloat()).coerceIn(0f, 1f)
            val y1 = ((tp.cyPx - tp.hPx / 2).toFloat() / imgH.toFloat()).coerceIn(0f, 1f)
            val x2 = ((tp.cxPx + tp.wPx / 2).toFloat() / imgW.toFloat()).coerceIn(0f, 1f)
            val y2 = ((tp.cyPx + tp.hPx / 2).toFloat() / imgH.toFloat()).coerceIn(0f, 1f)
            YoloDetector.BoundingBox(
                x1 = x1,
                y1 = y1,
                x2 = x2,
                y2 = y2,
                cx = tp.cxPx.toFloat(),
                cy = tp.cyPx.toFloat(),
                w = tp.wPx.toFloat(),
                h = tp.hPx.toFloat(),
                cnf = tp.cnf,
                cls = tp.cls,
                clsName = tp.clsName
            )
        }
    }

    private data class FrameStats(val avg: Int, val std: Double)

    private fun estimateFrameStats(rgb: ByteArray?, width: Int, height: Int): FrameStats? {
        if (rgb == null || width <= 0 || height <= 0 || rgb.isEmpty()) return null
        val stepX = maxOf(1, width / 32)
        val stepY = maxOf(1, height / 32)
        var sum = 0L
        var sumSq = 0L
        var count = 0L
        var y = 0
        while (y < height) {
            var x = 0
            while (x < width) {
                val idx = (y * width + x) * 3
                if (idx + 2 >= rgb.size) break
                val r = rgb[idx].toInt() and 0xFF
                val g = rgb[idx + 1].toInt() and 0xFF
                val b = rgb[idx + 2].toInt() and 0xFF
                val luma = (r * 30 + g * 59 + b * 11) / 100
                sum += luma
                sumSq += (luma * luma)
                count++
                x += stepX
            }
            y += stepY
        }
        if (count == 0L) return null
        val avg = (sum / count).toInt()
        val mean = sum.toDouble() / count.toDouble()
        val meanSq = sumSq.toDouble() / count.toDouble()
        val variance = (meanSq - mean * mean).coerceAtLeast(0.0)
        val std = kotlin.math.sqrt(variance)
        return FrameStats(avg = avg, std = std)
    }

    private fun isFrameVeryDark(rgb: ByteArray, width: Int, height: Int): Boolean {
        val stats = estimateFrameStats(rgb, width, height) ?: return true
        return (stats.avg < darkFrameLumaThreshold) || (stats.std < lowContrastStdThreshold)
    }

    private val vehicleClassIds = setOf(0) // car class id

    private fun filterBoxesForDisplay(boxes: List<YoloDetector.BoundingBox>): List<YoloDetector.BoundingBox> {
        // تم تقليل الثقة للتعرف على الصليب(+) بشكل أفضل
        val minConf = 0.45f
        // مساحة (تقريباً 20x20 بكسل على صورة الأبعاد 640x640)
        val minArea = 0.00034f

        return boxes.filter { box ->
            val w = box.x2 - box.x1
            val h = box.y2 - box.y1
            val area = w * h
       //     val aspect = w / h

            // استبعاد المربعات غير الطبيعية (شديدة العرض أو الارتفاع)
          //  val validAspect = aspect in 0.3f..3.0f

            box.cls in vehicleClassIds &&
                    box.cnf >= minConf &&
                    area >= minArea
          //          && validAspect
        }
    }

    private val requestPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { isGranted ->
            if (isGranted) setupCamera()
            else Toast.makeText(this, "Camera permission required", Toast.LENGTH_SHORT).show()
        }

    private val usbFolderPickerLauncher =
        registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri: Uri? ->
            if (uri != null) {
                contentResolver.takePersistableUriPermission(
                    uri,
                    android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                )
                val started = ScreenRecorder.startSaf(
                    treeUri = uri,
                    resolver = contentResolver,
                    overlay = binding.overlayView,
                    provider = { bmp ->
                        val frame = latestFrameRgb ?: return@startSaf false
                        val w = latestFrameWidth
                        val h = latestFrameHeight
                        if (w <= 0 || h <= 0 || frame.size < w * h * 3) return@startSaf false
                        if (bmp.width != w || bmp.height != h) return@startSaf false
                        val intPixels = IntArray(w * h)
                        var srcIdx = 0
                        for (i in 0 until (w * h)) {
                            val r = frame[srcIdx].toInt() and 0xFF
                            val g = frame[srcIdx + 1].toInt() and 0xFF
                            val b = frame[srcIdx + 2].toInt() and 0xFF
                            intPixels[i] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
                            srcIdx += 3
                        }
                        bmp.setPixels(intPixels, 0, w, 0, 0, w, h)
                        true
                    },
                    sizeProvider = { intArrayOf(latestFrameWidth, latestFrameHeight) },
                    context = this
                )
                if (started) {
                    binding.btnRecord.text = "Stop Rec"
                    binding.btnRecord.backgroundTintList = android.content.res.ColorStateList.valueOf(android.graphics.Color.RED)
                    Toast.makeText(this, "Recording to USB...", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this, "Failed to start recording", Toast.LENGTH_SHORT).show()
                }
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        Log.d("MainActivity", "MainActivity created")

        binding.viewFinder.implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        serialHelper = SerialHelper(this)
        serialHelper?.rxListener = object : SerialHelper.SerialRxListener {
            override fun onDataReceived(stab: Byte, modeCam: Byte, yaw: Float, pitch: Float, ctrl: Byte, time: Long, target: Byte, misType: Byte) {
                // تقسيم وتفكيك خانات (Bits) بايت الـ Ctrl
                val ctrlCmd = ctrl.toInt() and 0x07
                val fire = (ctrl.toInt() shr 4) and 0x01
                val link = (ctrl.toInt() shr 5) and 0x01
                
                Log.d("SerialRX", "Arduino Feedback - CMD: $ctrlCmd | FIRE: $fire | LINK: $link | MODE: $modeCam")
                
                runOnUiThread {
                    // إرسال التوقيت للواجهة
                    binding.overlayView.setSerialTimestamp(time)
                    
                    // معالجة وتنفيذ أمر إطلاق النار (Fire)
                    if (fire == 1 && lastFireState == 0) {
                        try { binding.btnRecord.setBackgroundColor(android.graphics.Color.RED) } catch (e: Exception){}
                        Toast.makeText(this@MainActivity, "🔥 FIRE COMMAND RECEIVED! 🔥", Toast.LENGTH_SHORT).show()
                        lastFireState = 1
                    } else if (fire == 0 && lastFireState == 1) {
                        try { binding.btnRecord.backgroundTintList = null } catch (e: Exception){} // إعادة اللون الطبيعي
                        lastFireState = 0
                    }
                    
                    // معالجة وتنفيذ أوامر التحكم (Control) بأسلوب التتبع اللحظي (State Machine)
                    // معالجة وتنفيذ أوامر التحكم (Control) بأسلوب التتبع اللحظي (State Machine)
                    if (ctrlCmd != lastCtrlCmd) {
                        if (ctrlCmd == 1) { // إيقاف (Stop)
                            stopDetectionMode()
                            binding.overlayView.setResults(emptyList())
                        } else if (ctrlCmd == 2 || ctrlCmd == 3) { // أوامر تشغيل النظام (Search / Track)
                            if (!shouldDetect) {
                                shouldDetect = true
                                binding.btnDetect.text = if (ctrlCmd == 3) "Tracking..." else "Searching..."
                                binding.btnDetect.isEnabled = false
                                binding.btnCancel.visibility = View.VISIBLE
                                detectHandler.removeCallbacks(detectRunnable)
                                detectHandler.post(detectRunnable)
                            }
                        }
                        lastCtrlCmd = ctrlCmd
                    }
                    
                    // دعم التوافقية للطريقة القديمة (في حال لم ترسل الواجهة أوامر في الـ Ctrl)
                    if (ctrlCmd == 0) {
                        if (modeCam == SerialHelper.MODE_SEARCHING && !shouldDetect) {
                            binding.overlayView.setResults(emptyList())
                            shouldDetect = true
                            binding.btnDetect.text = "Detecting..."
                            binding.btnDetect.isEnabled = false
                            binding.btnCancel.visibility = View.VISIBLE
                            detectHandler.removeCallbacks(detectRunnable)
                            detectHandler.post(detectRunnable)
                        }
                        if (modeCam == SerialHelper.MODE_OFF && shouldDetect) {
                            stopDetectionMode()
                            binding.overlayView.setResults(emptyList())
                        }
                    }
                }
            }
        }
        serialHelper?.connect()

        binding.overlayView.bringToFront()

        // تحديد النموذج: يمكنك تبديل الاسم حسب الرغبة
        val modelName = "TR_P3b.tflite"
        // اختيار التسريع المناسب: GPU للنماذج FP16، CPU للنماذج INT8
        val acceleration = if (modelName.contains("int8", ignoreCase = true))
            YoloDetector.Acceleration.CPU
        else
            YoloDetector.Acceleration.GPU

        yoloDetector = YoloDetector(
            this,
            modelName,
            "labels_detect.txt",
            this,
            acceleration
        )
        Log.d("MainActivity", "YOLO detector initialized with model=$modelName, acc=$acceleration")

        binding.btnDetect.setOnClickListener {
            binding.overlayView.setResults(emptyList())
            shouldDetect = true
            binding.btnDetect.text = "Detecting..."
            binding.btnDetect.isEnabled = false
            binding.btnCancel.visibility = View.VISIBLE
            detectHandler.removeCallbacks(detectRunnable)
            detectHandler.post(detectRunnable)
        }

        binding.btnCancel.setOnClickListener {
            stopDetectionMode()
            binding.overlayView.setResults(emptyList())
            Toast.makeText(this, "Cleared", Toast.LENGTH_SHORT).show()
        }

        binding.btnRecord.setOnClickListener {
            if (ScreenRecorder.isRecording()) {
                ScreenRecorder.stop()
                binding.btnRecord.text = "Record USB"
                binding.btnRecord.backgroundTintList = null
                Toast.makeText(this, "Recording Stopped", Toast.LENGTH_SHORT).show()
            } else {
                usbFolderPickerLauncher.launch(null)
            }
        }

        val zoomHandler = Handler(Looper.getMainLooper())
        val zoomStep = 0.05f
        val zoomIntervalMs = 50L

        var zoomInRunnable: Runnable? = null
        var zoomOutRunnable: Runnable? = null

        zoomInRunnable = Runnable {
            cameraHelper?.let { ch ->
                val (_, max) = ch.getZoomRange()
                val current = ch.getCurrentZoom()
                if (current < max) {
                    val next = (current + zoomStep).coerceAtMost(max)
                    ch.setZoom(next)
                    binding.tvZoomLevel.text = String.format(java.util.Locale.US, "%.1fx", next)
                }
            }
            zoomHandler.postDelayed(zoomInRunnable!!, zoomIntervalMs)
        }

        zoomOutRunnable = Runnable {
            cameraHelper?.let { ch ->
                val (min, _) = ch.getZoomRange()
                val current = ch.getCurrentZoom()
                if (current > min) {
                    val next = (current - zoomStep).coerceAtLeast(min)
                    ch.setZoom(next)
                    binding.tvZoomLevel.text = String.format(java.util.Locale.US, "%.1fx", next)
                }
            }
            zoomHandler.postDelayed(zoomOutRunnable!!, zoomIntervalMs)
        }

        binding.btnZoomIn.setOnTouchListener { _, event ->
            when (event.action) {
                android.view.MotionEvent.ACTION_DOWN -> {
                    zoomHandler.post(zoomInRunnable!!)
                    true
                }
                android.view.MotionEvent.ACTION_UP, android.view.MotionEvent.ACTION_CANCEL -> {
                    zoomHandler.removeCallbacks(zoomInRunnable!!)
                    true
                }
                else -> false
            }
        }

        binding.btnZoomOut.setOnTouchListener { _, event ->
            when (event.action) {
                android.view.MotionEvent.ACTION_DOWN -> {
                    zoomHandler.post(zoomOutRunnable!!)
                    true
                }
                android.view.MotionEvent.ACTION_UP, android.view.MotionEvent.ACTION_CANCEL -> {
                    zoomHandler.removeCallbacks(zoomOutRunnable!!)
                    true
                }
                else -> false
            }
        }

        val evHandler = Handler(Looper.getMainLooper())
        val evIntervalMs = 80L

        var evUpRunnable: Runnable? = null
        var evDownRunnable: Runnable? = null

        fun updateEvText(index: Int) {
            binding.tvBrightnessLevel.text = String.format(java.util.Locale.US, "%+d", index)
        }

        evUpRunnable = Runnable {
            cameraHelper?.let { ch ->
                val (_, max) = ch.getExposureRange()
                val current = ch.getCurrentExposure()
                if (current < max) {
                    val next = current + 1
                    ch.setExposure(next)
                    updateEvText(next)
                }
            }
            evHandler.postDelayed(evUpRunnable!!, evIntervalMs)
        }

        evDownRunnable = Runnable {
            cameraHelper?.let { ch ->
                val (min, _) = ch.getExposureRange()
                val current = ch.getCurrentExposure()
                if (current > min) {
                    val next = current - 1
                    ch.setExposure(next)
                    updateEvText(next)
                }
            }
            evHandler.postDelayed(evDownRunnable!!, evIntervalMs)
        }

        binding.btnBrightnessUp.setOnTouchListener { _, event ->
            when (event.action) {
                android.view.MotionEvent.ACTION_DOWN -> {
                    evHandler.post(evUpRunnable!!)
                    true
                }
                android.view.MotionEvent.ACTION_UP, android.view.MotionEvent.ACTION_CANCEL -> {
                    evHandler.removeCallbacks(evUpRunnable!!)
                    true
                }
                else -> false
            }
        }

        binding.btnBrightnessDown.setOnTouchListener { _, event ->
            when (event.action) {
                android.view.MotionEvent.ACTION_DOWN -> {
                    evHandler.post(evDownRunnable!!)
                    true
                }
                android.view.MotionEvent.ACTION_UP, android.view.MotionEvent.ACTION_CANCEL -> {
                    evHandler.removeCallbacks(evDownRunnable!!)
                    true
                }
                else -> false
            }
        }

        if (allPermissionsGranted()) {
            setupCamera()
        } else {
            requestPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    private fun setupCameraButtons() {
        val lenses = cameraHelper?.getAvailableLenses() ?: emptyList()
        val mainLens = lenses.find { it.label == "Main" }
        val wideLens = lenses.find { it.label == "Wide" }
        val teleLens = lenses.find { it.label == "Tele" }

        binding.btnBack.visibility = if (mainLens != null) View.VISIBLE else View.GONE
        binding.btnWide.visibility = if (wideLens != null) View.VISIBLE else View.GONE
        binding.btnTele.visibility = if (teleLens != null) View.VISIBLE else View.GONE

        binding.btnBack.setOnClickListener { mainLens?.let { cameraHelper?.setZoom(it.zoomRatio); highlightCameraButton(binding.btnBack) } }
        binding.btnWide.setOnClickListener { wideLens?.let { cameraHelper?.setZoom(it.zoomRatio); highlightCameraButton(binding.btnWide) } }
        binding.btnTele.setOnClickListener { teleLens?.let { cameraHelper?.setZoom(it.zoomRatio); highlightCameraButton(binding.btnTele) } }

        if (lenses.size <= 1) {
            binding.btnBack.visibility = View.GONE
            binding.btnWide.visibility = View.GONE
            binding.btnTele.visibility = View.GONE
        } else {
            highlightCameraButton(binding.btnBack)
        }
    }

    private fun highlightCameraButton(active: android.widget.Button) {
        listOf(binding.btnBack, binding.btnWide, binding.btnTele).forEach { it.alpha = if (it == active) 1.0f else 0.5f }
    }

    private fun setupCamera() {
        cameraHelper = CameraHelper(
            activity = this,
            previewView = binding.viewFinder,
            onFrame = { rgbBytes, width, height ->
                val required = width * height * 3
                val target = latestFrameRgb?.takeIf { it.size == required } ?: ByteArray(required)
                System.arraycopy(rgbBytes, 0, target, 0, required)
                latestFrameRgb = target
                latestFrameWidth = width
                latestFrameHeight = height

                fpsFrameCount++
                val now = System.currentTimeMillis()
                
                // تحديث وقت استلام الصورة ليعلم المنفذ التسلسلي أن الكاميرا تعمل
                serialHelper?.lastFrameTimeMs = now
                
                if (now - fpsLastTime >= 1000L) {
                    cameraFps = fpsFrameCount
                    fpsFrameCount = 0
                    fpsLastTime = now
                    runOnUiThread { binding.overlayView.setFps(cameraFps) }
                }
            },
            onCameraReady = {
                setupCameraButtons()
                Log.d("MainActivity", "Camera ready, lenses configured")
            }
        )
        cameraHelper?.startCamera()
    }

    private fun stopDetectionMode() {
        shouldDetect = false
        isDetecting = false
        tracks.clear()
        primaryTargetCx = -1f
        primaryTargetCy = -1f
        detectHandler.removeCallbacks(detectRunnable)
        binding.overlayView.setResults(emptyList())
        binding.btnDetect.text = "Detect Now"
        binding.btnDetect.isEnabled = true
        binding.btnCancel.visibility = View.GONE
        
        serialHelper?.let { serial ->
            serial.modeDetect = SerialHelper.MODE_IDLE
            serial.ipu = 1 // state=1 (idle), find=0, lock=0 -> 1
        }
    }

    override fun onEmptyDetect() {
        isDetecting = false
        if (!shouldDetect) return
        detectHandler.post { scheduleNextInference() }
        val targets = updateTracksAndSelectTargets(emptyList(), latestFrameWidth, latestFrameHeight)
        
        val singleTarget = if (targets.size <= 1) {
            targets
        } else {
            val closest = targets.minByOrNull { box ->
                val cx = (box.x1 + box.x2) / 2f
                val cy = (box.y1 + box.y2) / 2f
                val dx = cx - primaryTargetCx
                val dy = cy - primaryTargetCy
                dx * dx + dy * dy
            }
            closest?.let {
                primaryTargetCx = (it.x1 + it.x2) / 2f
                primaryTargetCy = (it.y1 + it.y2) / 2f
            }
            listOfNotNull(closest)
        }

        // إذا لم يتبقّـِ هدف (بعد فترة التتبع المجمّّد) عودنا لمود المسح
        if (singleTarget.isEmpty()) {
            cameraHelper?.isTrackingMode = false
        }
        
        runOnUiThread { 
            cameraHelper?.let { ch ->
                binding.overlayView.setVisualDimensions(
                    ch.lastRotationDegrees, ch.lastSensorWidth, ch.lastSensorHeight
                )
            }
            binding.overlayView.setResults(singleTarget)
            
            serialHelper?.let { serial ->
                serial.targetAngleX = binding.overlayView.outAngleX
                serial.targetAngleY = binding.overlayView.outAngleY
                serial.rateAngleX = binding.overlayView.outRateX
                serial.rateAngleY = binding.overlayView.outRateY
                val vw = binding.overlayView.width.toFloat()
                val vh = binding.overlayView.height.toFloat()
                if (singleTarget.isNotEmpty()) {
                    val box = singleTarget[0]
                    serial.targetWidth = (((box.x2 - box.x1) * vw) / 10).toInt()
                    serial.targetHeight = (((box.y2 - box.y1) * vh) / 10).toInt()
                } else {
                    serial.targetWidth = 0
                    serial.targetHeight = 0
                }
                serial.modeDetect = if (singleTarget.isNotEmpty()) SerialHelper.MODE_TRACK else SerialHelper.MODE_SEARCHING
                
                if (singleTarget.isNotEmpty()) {
                    val box = singleTarget[0]
                    serial.xPos = (box.cx - (latestFrameWidth / 2f)).toInt()
                    serial.yPos = (box.cy - (latestFrameHeight / 2f)).toInt()
                } else {
                    serial.xPos = 0
                    serial.yPos = 0
                }
                
                val ipuState = if (!shouldDetect) 1 else if (singleTarget.isEmpty()) 2 else 3
                val findCount = if (targets.isEmpty()) 0 else if (targets.size == 1) 1 else 2
                val lockBit = if (singleTarget.isNotEmpty()) 1 else 0
                
                serial.ipu = ((lockBit shl 6) or (findCount shl 3) or ipuState).toByte()
            }
        }
    }

    private fun transformBoxesToPreviewSpace(
        boxes: List<YoloDetector.BoundingBox>
    ): List<YoloDetector.BoundingBox> {
        //
        // الشاشة portrait-locked. Preview يعرض دائماً بدوران 90° CW من المستشعر:
        //   visual_x = 1 - sensor_y / sh      (visualW = sh = 2160)
        //   visual_y = sensor_x / sw           (visualH = sw = 3840)
        //
        // rotDeg بتحدد كيف applyRotationAndMirror دوّرت القصاصة قبل YOLO.
        // نشتق موضع المستشعر من YOLO ثم نحوّله للفضاء المرئي.
        //
        // ✔ نستخدم اللقطة المحفوظة وقت أخذ الفريم (لا القيم الحية التي تغيّرت)
        val rotDeg = inferRotDeg
        val crop   = inferCropRect
        val sw     = inferSensorW.toFloat()
        val sh     = inferSensorH.toFloat()
        val cL     = crop.left.toFloat()
        val cT     = crop.top.toFloat()
        val cS     = 640f

        return boxes.map { box ->
            val vx1: Float; val vy1: Float; val vx2: Float; val vy2: Float

            when ((rotDeg + 360) % 360) {
                90 -> {
                    // rotateRgb90: YOLO(bx,by) ← sensor(cL+by·cS, cT+(1-bx)·cS)
                    // visual_x = (sh-cT-cS+bx·cS)/sh  |  visual_y = (cL+by·cS)/sw
                    vx1 = (sh - cT - cS + box.x1 * cS) / sh
                    vy1 = (cL + box.y1 * cS) / sw
                    vx2 = (sh - cT - cS + box.x2 * cS) / sh
                    vy2 = (cL + box.y2 * cS) / sw
                }
                0 -> {
                    // لا دوران: YOLO(bx,by) ← sensor(cL+bx·cS, cT+by·cS)
                    // visual_x = 1-(cT+by·cS)/sh = (sh-cT-by·cS)/sh
                    // visual_y = (cL+bx·cS)/sw
                    vx1 = (sh - cT - box.y2 * cS) / sh
                    vy1 = (cL + box.x1 * cS) / sw
                    vx2 = (sh - cT - box.y1 * cS) / sh
                    vy2 = (cL + box.x2 * cS) / sw
                }
                180 -> {
                    // rotateRgb180: YOLO(bx,by) ← sensor(cL+(1-bx)·cS, cT+(1-by)·cS)
                    // visual_x = (sh-cT-cS+by·cS)/sh
                    // visual_y = (cL+(1-bx)·cS)/sw  → تنخفض كلما زاد bx
                    vx1 = (sh - cT - cS + box.y1 * cS) / sh
                    vy1 = (cL + (1f - box.x2) * cS) / sw
                    vx2 = (sh - cT - cS + box.y2 * cS) / sh
                    vy2 = (cL + (1f - box.x1) * cS) / sw
                }
                else -> { // 270°
                    // rotateRgb270: YOLO(bx,by) ← sensor(cL+(1-by)·cS, cT+bx·cS)
                    // visual_x = (sh-cT-bx·cS)/sh  → تنخفض كلما زاد bx
                    // visual_y = (cL+(1-by)·cS)/sw  → تنخفض كلما زاد by
                    vx1 = (sh - cT - box.x2 * cS) / sh
                    vy1 = (cL + (1f - box.y2) * cS) / sw
                    vx2 = (sh - cT - box.x1 * cS) / sh
                    vy2 = (cL + (1f - box.y1) * cS) / sw
                }
            }

            val fx1 = minOf(vx1, vx2).coerceIn(0f, 1f)
            val fy1 = minOf(vy1, vy2).coerceIn(0f, 1f)
            val fx2 = maxOf(vx1, vx2).coerceIn(0f, 1f)
            val fy2 = maxOf(vy1, vy2).coerceIn(0f, 1f)
            box.copy(
                x1 = fx1, y1 = fy1, x2 = fx2, y2 = fy2,
                cx = (fx1 + fx2) / 2f, cy = (fy1 + fy2) / 2f,
                w  = fx2 - fx1, h = fy2 - fy1
            )
        }
    }


    override fun onDetect(boundingBoxes: List<YoloDetector.BoundingBox>, inferenceTime: Long) {
        Log.d("MainActivity", "onDetect: received ${boundingBoxes.size} boxes")
        isDetecting = false
        if (!shouldDetect) return

        detectHandler.post { scheduleNextInference() }

        detectFpsCount++
        val now = System.currentTimeMillis()
        if (now - detectFpsLastTime >= 1000L) {
            detectFps = detectFpsCount
            detectFpsCount = 0
            detectFpsLastTime = now
            runOnUiThread { binding.overlayView.setDetectFps(detectFps) }
        }

        val transformed = transformBoxesToPreviewSpace(boundingBoxes)
        val filtered = filterBoxesForDisplay(transformed)
        Log.d("MainActivity", "After filter: ${filtered.size} boxes")

        val targets = updateTracksAndSelectTargets(filtered, latestFrameWidth, latestFrameHeight)

        val singleTarget = if (targets.size <= 1) {
            targets.firstOrNull()?.let {
                // التحديث الدائم لموقع الهدف الوحيد للحفاظ على تماسكه
                primaryTargetCx = (it.x1 + it.x2) / 2f
                primaryTargetCy = (it.y1 + it.y2) / 2f
            }
            targets
        } else {
            val closest = targets.minByOrNull { box ->
                val cx = (box.x1 + box.x2) / 2f
                val cy = (box.y1 + box.y2) / 2f
                // إذا لم يتم الاستحواذ بعد، نقارن مع مركز الشاشة الهندسي. وإلا نلاحق الهدف الحالي.
                val refX = if (primaryTargetCx < 0f) 0.5f else primaryTargetCx
                val refY = if (primaryTargetCy < 0f) 0.5f else primaryTargetCy
                val dx = cx - refX
                val dy = cy - refY
                dx * dx + dy * dy
            }
            closest?.let {
                primaryTargetCx = (it.x1 + it.x2) / 2f
                primaryTargetCy = (it.y1 + it.y2) / 2f
            }
            listOfNotNull(closest)
        }

        // ─── تحديث حالة الماسح/المتتبع ──────────────────────────────
        if (singleTarget.isNotEmpty()) {
            val vbox = singleTarget[0]
            val vcx = (vbox.x1 + vbox.x2) / 2f
            val vcy = (vbox.y1 + vbox.y2) / 2f
            val stx = vcy
            val sty = 1f - vcx
            trackMissCount = 0          // وجد هدف → أعد العداد
            cameraHelper?.let {
                it.isTrackingMode = true
                it.trackTargetX   = stx.coerceIn(0f, 1f)
                it.trackTargetY   = sty.coerceIn(0f, 1f)
            }
        } else {
            if (cameraHelper?.isTrackingMode == true) {
                // في وضع التتبع: ابدأ العداد
                trackMissCount++
                if (trackMissCount >= TRACK_MAX_MISS) {
                    // تجاوز الحد → تبديل لوضع البحث
                    trackMissCount = 0
                    cameraHelper?.isTrackingMode = false
                    Log.d("MainActivity", "Tracking lost after $TRACK_MAX_MISS misses → Search mode")
                }
                // else: استمر في التتبع (ابقَ على آخر موضع معروف)
            }
            // إذا كنا بالفعل في وضع البحث → لا شيء
        }
        // ───────────────────────────────────────────────────────

        runOnUiThread {
            binding.overlayView.setImageDimensions(latestFrameWidth, latestFrameHeight)
            /*cameraHelper?.let { ch ->
                binding.overlayView.setCameraFov(ch.fovX, ch.fovY)
                binding.overlayView.setVisualDimensions(
                    ch.lastRotationDegrees, ch.lastSensorWidth, ch.lastSensorHeight
                )
            }*/
            binding.overlayView.setInferenceTime(inferenceTime)
            binding.overlayView.setResults(singleTarget)

            serialHelper?.let { serial ->
                serial.targetAngleX = binding.overlayView.outAngleX
                serial.targetAngleY = binding.overlayView.outAngleY
                serial.rateAngleX = binding.overlayView.outRateX
                serial.rateAngleY = binding.overlayView.outRateY
                val vw = binding.overlayView.width.toFloat()
                val vh = binding.overlayView.height.toFloat()
                if (singleTarget.isNotEmpty()) {
                    val box = singleTarget[0]
                    serial.targetWidth = (((box.x2 - box.x1) * vw) / 10).toInt()
                    serial.targetHeight = (((box.y2 - box.y1) * vh) / 10).toInt()
                } else {
                    serial.targetWidth = 0
                    serial.targetHeight = 0
                }
                serial.modeDetect = if (singleTarget.isNotEmpty()) SerialHelper.MODE_TRACK else SerialHelper.MODE_SEARCHING
                
                if (singleTarget.isNotEmpty()) {
                    val box = singleTarget[0]
                    serial.xPos = (box.cx - (latestFrameWidth / 2f)).toInt()
                    serial.yPos = (box.cy - (latestFrameHeight / 2f)).toInt()
                } else {
                    serial.xPos = 0
                    serial.yPos = 0
                }
                
                // --- حساب البتات لمتغير IPU حسب هيكل البيانات ---
                val ipuState = if (!shouldDetect) 1 else if (singleTarget.isEmpty()) 2 else 3
                val findCount = if (targets.isEmpty()) 0 else if (targets.size == 1) 1 else 2
                val lockBit = if (singleTarget.isNotEmpty()) 1 else 0
                
                // دمج الخانات:
                // Bit  [2:0] = ipuState
                // Bits [5:3] = findCount
                // Bit  [6]   = lockBit
                val ipuByte = ((lockBit shl 6) or (findCount shl 3) or ipuState).toByte()
                serial.ipu = ipuByte
            }
        }
    }

    override fun onDestroy() {
        detectHandler.removeCallbacks(detectRunnable)
        inferenceExecutor.shutdown()
        cameraHelper?.stopCamera()
        yoloDetector?.close()
        serialHelper?.disconnect()
        ScreenRecorder.stop()
        super.onDestroy()
    }

    private fun allPermissionsGranted() = ContextCompat.checkSelfPermission(baseContext, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
}