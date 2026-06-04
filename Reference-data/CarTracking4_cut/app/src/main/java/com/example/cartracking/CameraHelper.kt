package com.example.cartracking

import android.animation.ValueAnimator
import android.graphics.Rect
import android.hardware.camera2.CaptureRequest
import android.util.Log
import android.util.Range
import android.util.Size
import android.view.OrientationEventListener
import android.view.Surface
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.camera2.interop.Camera2Interop
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.content.Context
import androidx.camera.camera2.interop.Camera2CameraInfo
import java.nio.ByteBuffer
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import android.util.Rational
import androidx.annotation.OptIn
import androidx.camera.camera2.interop.ExperimentalCamera2Interop

class CameraHelper(
    private val activity: AppCompatActivity,
    private val previewView: PreviewView,
    private val onFrame: (rgbBytes: ByteArray, width: Int, height: Int) -> Unit,
    private val onCameraReady: (() -> Unit)? = null
) {
    private var cameraExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private var cameraProvider: ProcessCameraProvider? = null
    private var currentSelector: CameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

    private var reusableRgbBuffer: ByteArray? = null
    private var reusableRgbRotatedBuffer: ByteArray? = null
    private var reusableRowBuffer: ByteArray? = null
    private var reusableURow: ByteArray? = null
    private var reusableVRow: ByteArray? = null
    private var loggedFirstFrame = false
    private var imageAnalysis: ImageAnalysis? = null
    private var camera: Camera? = null

    @Volatile
    var lastRotationDegrees: Int = 90
        private set

    @Volatile
    var lastCropRect: Rect = Rect(0, 0, 640, 640)
        private set

    @Volatile
    var lastImageWidth: Int = 640
        private set

    @Volatile
    var lastImageHeight: Int = 640
        private set

    @Volatile
    var lastSensorWidth: Int = 1920
        private set

    @Volatile
    var lastSensorHeight: Int = 1080
        private set

    // ─── Scanner / Tracker state ──────────────────────────────────────────────
    // وضع المسح: يكون true عند البحث (لا يوجد هدف), false عند التتبع
    @Volatile var isTrackingMode: Boolean = false

    // مركز الهدف في فضاء الـ sensor [0,1] - يُحدَّث من MainActivity
    @Volatile var trackTargetX: Float = 0.5f
    @Volatile var trackTargetY: Float = 0.5f

    // الموضع الحالي لمنطقة القص [0,1] - يحسبه Scanner تلقائياً
    @Volatile var cropFocusX: Float = 0.5f
        private set
    @Volatile var cropFocusY: Float = 0.5f
        private set

    // متغيرات داخلية للماسح الثعباني (Boustrophedon)
    private var scanX:    Float = 0.5f   // cropFocusX الحالي [0,1] - المحور السريع (X المستشعر = 3840)
    private var scanXDir: Float = +1f    // اتجاه حركة X
    private var scanY:    Float = 0.5f   // cropFocusY الحالي [0,1] - المحور البطيء (Y المستشعر = 2160)
    private var scanYDir: Float = +1f    // اتجاه خطوة Y
    // ─────────────────────────────────────────────────────────────────────────

    @Volatile
    var fovX: Float = 47f
        private set

    @Volatile
    var fovY: Float = 78f
        private set

    private val orientationListener = object : OrientationEventListener(activity) {
        override fun onOrientationChanged(orientation: Int) {
            if (orientation == ORIENTATION_UNKNOWN) return
            val rotation = when {
                orientation < 45 || orientation >= 315 -> Surface.ROTATION_0
                orientation < 135                      -> Surface.ROTATION_270
                orientation < 225                      -> Surface.ROTATION_180
                else                                   -> Surface.ROTATION_90
            }
            imageAnalysis?.targetRotation = rotation
        }
    }


    fun startCamera(selector: CameraSelector = CameraSelector.DEFAULT_BACK_CAMERA) {
        currentSelector = selector
        val cameraProviderFuture = ProcessCameraProvider.getInstance(activity)

        cameraProviderFuture.addListener({
            cameraProvider = cameraProviderFuture.get()
            bindCameraUseCases()
        }, ContextCompat.getMainExecutor(activity))
    }

    @androidx.camera.camera2.interop.ExperimentalCamera2Interop
    @OptIn(ExperimentalCamera2Interop::class)
    private fun bindCameraUseCases() {
        val provider = cameraProvider ?: return

        val resolutionSelector = androidx.camera.core.resolutionselector.ResolutionSelector.Builder()
            .setResolutionStrategy(
                androidx.camera.core.resolutionselector.ResolutionStrategy(
                    Size(1920, 1080),
                    androidx.camera.core.resolutionselector.ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER
                )
            )
            .setAspectRatioStrategy(
                androidx.camera.core.resolutionselector.AspectRatioStrategy.RATIO_16_9_FALLBACK_AUTO_STRATEGY
            )
            .build()

        val previewBuilder = Preview.Builder()
            .setResolutionSelector(resolutionSelector)
            
        @Suppress("RestrictedApi")
        Camera2Interop.Extender(previewBuilder)
            .setCaptureRequestOption(
                CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE,
                Range(60, 60)
            )
        val preview = previewBuilder.build()
            .also {
                it.setSurfaceProvider(previewView.surfaceProvider)
            }

        val analysisBuilder = ImageAnalysis.Builder()
            .setResolutionSelector(resolutionSelector)
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)

        @Suppress("RestrictedApi")
        Camera2Interop.Extender(analysisBuilder)
            .setCaptureRequestOption(
                CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE,
                Range(60, 60)
            )

        val imageAnalyzer: ImageAnalysis = analysisBuilder.build()
            .also {
                it.setAnalyzer(cameraExecutor) { imageProxy ->
                    try {
                        val srcW = imageProxy.width
                        val srcH = imageProxy.height
                        val rotationDegrees = imageProxy.imageInfo.rotationDegrees

                        if (!loggedFirstFrame) {
                            loggedFirstFrame = true
                            Log.d("CameraHelper", "========== 4K CAPTURE CONFIRMED ==========")
                            Log.d("CameraHelper", "Source resolution: ${srcW}x${srcH}")
                            Log.d("CameraHelper", "Rotation: $rotationDegrees°")
                            Log.d("CameraHelper", "Planes: ${imageProxy.planes.size}")
                            for (i in imageProxy.planes.indices) {
                                val p = imageProxy.planes[i]
                                Log.d("CameraHelper", "  Plane[$i] rowStride=${p.rowStride} pixelStride=${p.pixelStride} bufSize=${p.buffer.capacity()}")
                            }
                            Log.d("CameraHelper", "CropRect: ${imageProxy.cropRect}")
                            Log.d("CameraHelper", "Downscale: ${srcW}x${srcH} → ${INFERENCE_SIZE}x${INFERENCE_SIZE}")
                            Log.d("CameraHelper", "Ratio X: ${srcW.toFloat()/INFERENCE_SIZE}x  Y: ${srcH.toFloat()/INFERENCE_SIZE}x")
                            Log.d("CameraHelper", "===========================================")
                        }

                        lastRotationDegrees = rotationDegrees
                        lastSensorWidth = srcW
                        lastSensorHeight = srcH
                        
                        // ─── تحديث موضع منطقة القص ────────────────────────────
                        if (isTrackingMode) {
                            // وضع التتبع: مركز القص = مركز الهدف فوراً (بدون تأخير)
                            // الهدف دائماً في مركز مربع الـ 640×640
                            cropFocusX = trackTargetX.coerceIn(0f, 1f)
                            cropFocusY = trackTargetY.coerceIn(0f, 1f)
                            // حافظ على تزامن المتغيرات الداخلية للعودة للمسح
                            scanX = cropFocusX
                            scanY = cropFocusY
                        } else {
                            // وضع المسح الثعباني (Boustrophedon Snake Scan)
                            //   المحور السريع : scanX يتحرك 50 بكسل/فريم على محور X المستشعر (3840)
                            //   المحور البطيء: scanY يقفز 320 بكسل عند كل انعكاس لـ scanX
                            val STEP_X = 480f / srcW.toFloat()  // 320 بكسل/فريم ≈ 0.083
                            val STEP_Y = 540f / srcH.toFloat()  // 320 بكسل/انعكاس ≈ 0.148

                            scanX += STEP_X * scanXDir

                            if (scanX >= 1f) {            // وصل الطرف الأيمن
                                scanX = 1f
                                scanXDir = -1f
                                scanY += STEP_Y * scanYDir
                                if (scanY >= 1f) { scanY = 1f; scanYDir = -1f }
                                if (scanY <= 0f) { scanY = 0f; scanYDir = +1f }
                            } else if (scanX <= 0f) {     // وصل الطرف الأيسر
                                scanX = 0f
                                scanXDir = +1f
                                scanY += STEP_Y * scanYDir
                                if (scanY >= 1f) { scanY = 1f; scanYDir = -1f }
                                if (scanY <= 0f) { scanY = 0f; scanYDir = +1f }
                            }

                            //cropFocusX = scanX
                           // cropFocusY = scanY
                            cropFocusX = 0.5f
                            cropFocusY = 0.5f
                        }
                        // ───────────────────────────────────────────────────────

                        var startX = (srcW * cropFocusX - INFERENCE_SIZE / 2).toInt()
                        var startY = (srcH * cropFocusY - INFERENCE_SIZE / 2).toInt()
                        startX = startX.coerceIn(0, srcW - INFERENCE_SIZE)
                        startY = startY.coerceIn(0, srcH - INFERENCE_SIZE)

                        lastCropRect    = Rect(startX, startY, startX + INFERENCE_SIZE, startY + INFERENCE_SIZE)
                        lastImageWidth  = INFERENCE_SIZE
                        lastImageHeight = INFERENCE_SIZE

                        val required = INFERENCE_SIZE * INFERENCE_SIZE * 3
                        val rgbBytes = reusableRgbBuffer?.takeIf { it.size == required } ?: ByteArray(required)
                        reusableRgbBuffer = rgbBytes

                        cropYuvToRgb(
                            imageProxy.planes[0].buffer, imageProxy.planes[0].rowStride,
                            imageProxy.planes[1].buffer, imageProxy.planes[1].rowStride, imageProxy.planes[1].pixelStride,
                            imageProxy.planes[2].buffer, imageProxy.planes[2].rowStride, imageProxy.planes[2].pixelStride,
                            srcW, srcH,
                            startX, startY,
                            rgbBytes,
                            INFERENCE_SIZE, INFERENCE_SIZE
                        )

                        val rotated = applyRotationAndMirror(rgbBytes, INFERENCE_SIZE, INFERENCE_SIZE, rotationDegrees, currentSelector == CameraSelector.DEFAULT_FRONT_CAMERA)
                        onFrame(rotated, INFERENCE_SIZE, INFERENCE_SIZE)
                    } catch (t: Throwable) {
                        Log.e("CameraHelper", "Failed to convert frame", t)
                    } finally {
                        imageProxy.close()
                    }
                }
            }

        try {
            provider.unbindAll()
            loggedFirstFrame = false

            // Diagnostic: log all supported YUV resolutions
            try {
                val cameraManager = activity.getSystemService(Context.CAMERA_SERVICE) as CameraManager
                for (cameraId in cameraManager.cameraIdList) {
                    val chars = cameraManager.getCameraCharacteristics(cameraId)
                    val facing = chars.get(CameraCharacteristics.LENS_FACING)
                    if (facing == CameraCharacteristics.LENS_FACING_BACK) {
                        val map = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                        val sizes = map?.getOutputSizes(android.graphics.ImageFormat.YUV_420_888)
                        Log.d("CameraHelper", "=== Supported YUV sizes (camera $cameraId) === map=${if(map==null) "NULL" else "OK"} count=${sizes?.size ?: 0}")
                        if (sizes == null || sizes.isEmpty()) {
                            Log.w("CameraHelper", "  ⚠️ No YUV sizes available for camera $cameraId")
                        } else {
                            sizes.sortedByDescending { it.width * it.height }.forEach {
                                Log.d("CameraHelper", "  ${it.width}x${it.height}")
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e("CameraHelper", "Failed to enumerate sizes", e)
            }

            // Bind Preview and ImageAnalysis independently (no shared ViewPort)
            // so ImageAnalysis can use 4K resolution independently of Preview
            camera = provider.bindToLifecycle(activity, currentSelector, preview, imageAnalyzer)
            Log.d("CameraHelper", "Bound without ViewPort (4K independent pipeline)")
            val zoomState = camera?.cameraInfo?.zoomState?.value
            Log.d("CameraHelper", "Zoom range: min=${zoomState?.minZoomRatio} max=${zoomState?.maxZoomRatio}")
            
            // Calculate dynamic FOV
            try {
                val cameraInfo = camera?.cameraInfo
                if (cameraInfo != null) {
                    val camera2Info = Camera2CameraInfo.from(cameraInfo)
                    val cameraManager = activity.getSystemService(Context.CAMERA_SERVICE) as CameraManager
                    val characteristics = cameraManager.getCameraCharacteristics(camera2Info.cameraId)
                    val focalLengths = characteristics.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)
                    val sensorSize = characteristics.get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE)
                    if (focalLengths != null && sensorSize != null && focalLengths.isNotEmpty()) {
                        val f = focalLengths[0]
                        val w = sensorSize.width
                        val h = sensorSize.height
                        fovX = (2 * Math.atan((w / (2 * f)).toDouble()) * 180 / Math.PI).toFloat()
                        fovY = (2 * Math.atan((h / (2 * f)).toDouble()) * 180 / Math.PI).toFloat()
                        Log.d("CameraHelper", "Calculated FOV: X=$fovX, Y=$fovY")
                    }
                }
            } catch (e: Exception) {
                Log.e("CameraHelper", "Failed to calculate dynamic FOV", e)
            }

            imageAnalysis = imageAnalyzer
            orientationListener.enable()
            onCameraReady?.invoke()
        } catch (exc: Exception) {
            Log.e("CameraHelper", "Use case binding failed", exc)
        }
    }

    private fun applyRotationAndMirror(
        srcRgb: ByteArray,
        width: Int,
        height: Int,
        rotationDegrees: Int,
        mirrorHorizontal: Boolean
    ): ByteArray {
        val required = width * height * 3
        val dst = reusableRgbRotatedBuffer?.takeIf { it.size == required } ?: ByteArray(required)
        reusableRgbRotatedBuffer = dst

        val rot = ((rotationDegrees % 360) + 360) % 360
        when (rot) {
            0 -> {
                if (!mirrorHorizontal) {
                    System.arraycopy(srcRgb, 0, dst, 0, required)
                } else {
                    mirrorRgbInPlace(srcRgb, dst, width, height)
                }
            }
            90 -> {
                rotateRgb90(srcRgb, dst, width, height)
                if (mirrorHorizontal) {
                    // After rotation, the image is still width x height because we're using 640x640.
                    mirrorRgbInPlace(dst, dst, width, height)
                }
            }
            180 -> {
                rotateRgb180(srcRgb, dst, width, height)
                if (mirrorHorizontal) {
                    mirrorRgbInPlace(dst, dst, width, height)
                }
            }
            270 -> {
                rotateRgb270(srcRgb, dst, width, height)
                if (mirrorHorizontal) {
                    mirrorRgbInPlace(dst, dst, width, height)
                }
            }
            else -> {
                // Unexpected angle: fallback to copy
                System.arraycopy(srcRgb, 0, dst, 0, required)
            }
        }
        return dst
    }

    private fun rotateRgb90(src: ByteArray, dst: ByteArray, width: Int, height: Int) {
        // dst(x, y) = src(x', y') with 90° CW
        // For square images, width == height.
        for (y in 0 until height) {
            for (x in 0 until width) {
                val srcX = x
                val srcY = y
                val dstX = height - 1 - srcY
                val dstY = srcX
                val s = (srcY * width + srcX) * 3
                val d = (dstY * width + dstX) * 3
                dst[d] = src[s]
                dst[d + 1] = src[s + 1]
                dst[d + 2] = src[s + 2]
            }
        }
    }

    private fun rotateRgb180(src: ByteArray, dst: ByteArray, width: Int, height: Int) {
        for (y in 0 until height) {
            for (x in 0 until width) {
                val dstX = width - 1 - x
                val dstY = height - 1 - y
                val s = (y * width + x) * 3
                val d = (dstY * width + dstX) * 3
                dst[d] = src[s]
                dst[d + 1] = src[s + 1]
                dst[d + 2] = src[s + 2]
            }
        }
    }

    private fun rotateRgb270(src: ByteArray, dst: ByteArray, width: Int, height: Int) {
        // 270° CW == 90° CCW
        for (y in 0 until height) {
            for (x in 0 until width) {
                val srcX = x
                val srcY = y
                val dstX = srcY
                val dstY = width - 1 - srcX
                val s = (srcY * width + srcX) * 3
                val d = (dstY * width + dstX) * 3
                dst[d] = src[s]
                dst[d + 1] = src[s + 1]
                dst[d + 2] = src[s + 2]
            }
        }
    }

    private fun mirrorRgbInPlace(src: ByteArray, dst: ByteArray, width: Int, height: Int) {
        for (y in 0 until height) {
            for (x in 0 until width) {
                val mx = width - 1 - x
                val s = (y * width + x) * 3
                val d = (y * width + mx) * 3
                dst[d] = src[s]
                dst[d + 1] = src[s + 1]
                dst[d + 2] = src[s + 2]
            }
        }
    }


    private fun rgba8888ToRgb(
        rgbaBuffer: ByteBuffer,
        width: Int,
        height: Int,
        rowStride: Int,
        pixelStride: Int,
        outRgb: ByteArray
    ) {
        // OUTPUT_IMAGE_FORMAT_RGBA_8888 => typically pixelStride=4 (R,G,B,A)
        rgbaBuffer.rewind()

        var out = 0
        val row = ByteArray(rowStride)
        for (y in 0 until height) {
            rgbaBuffer.get(row, 0, rowStride)
            var inIdx = 0
            for (x in 0 until width) {
                outRgb[out++] = row[inIdx]
                outRgb[out++] = row[inIdx + 1]
                outRgb[out++] = row[inIdx + 2]
                inIdx += pixelStride
            }
        }
    }

    /**
     * Sniper mode (Center Crop): extracts a contiguous outW x outH pixel block
     * from the YUV buffer without rescaling.
     */
    private fun cropYuvToRgb(
        yBuf: ByteBuffer, yRowStride: Int,
        uBuf: ByteBuffer, uRowStride: Int, uvPixelStride: Int,
        vBuf: ByteBuffer, vRowStride: Int, vPixelStride: Int,
        srcW: Int, srcH: Int,
        startX: Int, startY: Int,
        outRgb: ByteArray,
        outW: Int, outH: Int
    ) {
        val yRow = reusableRowBuffer?.takeIf { it.size >= yRowStride } ?: ByteArray(yRowStride).also { reusableRowBuffer = it }
        val uRow = reusableURow?.takeIf { it.size >= uRowStride } ?: ByteArray(uRowStride).also { reusableURow = it }
        val vRow = reusableVRow?.takeIf { it.size >= vRowStride } ?: ByteArray(vRowStride).also { reusableVRow = it }

        var outIdx = 0
        val endY = startY + outH
        var lastSrcY = -1
        var lastUvRow = -1

        for (srcY in startY until endY) {
            val uvRow = srcY shr 1

            if (srcY != lastSrcY) {
                yBuf.position(srcY * yRowStride)
                val yRem = yBuf.remaining()
                val yToRead = if (yRowStride > yRem) yRem else yRowStride
                yBuf.get(yRow, 0, yToRead)
                lastSrcY = srcY
            }

            if (uvRow != lastUvRow) {
                uBuf.position(uvRow * uRowStride)
                val uRem = uBuf.remaining()
                val uToRead = if (uRowStride > uRem) uRem else uRowStride
                uBuf.get(uRow, 0, uToRead)

                vBuf.position(uvRow * vRowStride)
                val vRem = vBuf.remaining()
                val vToRead = if (vRowStride > vRem) vRem else vRowStride
                vBuf.get(vRow, 0, vToRead)

                lastUvRow = uvRow
            }

            for (dx in 0 until outW) {
                val srcX = startX + dx
                val uvCol = srcX shr 1

                val yVal = yRow[srcX].toInt() and 0xFF
                val uVal = uRow[uvCol * uvPixelStride].toInt() and 0xFF
                val vVal = vRow[uvCol * vPixelStride].toInt() and 0xFF

                val yy = yVal - 16
                val uu = uVal - 128
                val vv = vVal - 128

                var r = (1192 * yy + 1634 * vv) shr 10
                var g = (1192 * yy - 833 * vv - 400 * uu) shr 10
                var b = (1192 * yy + 2066 * uu) shr 10

                if (r < 0) r = 0 else if (r > 255) r = 255
                if (g < 0) g = 0 else if (g > 255) g = 255
                if (b < 0) b = 0 else if (b > 255) b = 255

                outRgb[outIdx]     = r.toByte()
                outRgb[outIdx + 1] = g.toByte()
                outRgb[outIdx + 2] = b.toByte()
                outIdx += 3
            }
        }
    }

    data class LensInfo(val label: String, val zoomRatio: Float)

    fun getAvailableLenses(): List<LensInfo> {
        val zoomState = camera?.cameraInfo?.zoomState?.value ?: return listOf(LensInfo("Main", 1.0f))
        val minZoom = zoomState.minZoomRatio
        val maxZoom = zoomState.maxZoomRatio
        Log.d("CameraHelper", "getAvailableLenses: min=$minZoom max=$maxZoom")

        val lenses = mutableListOf<LensInfo>()
        if (minZoom < 1.0f) {
            lenses.add(LensInfo("Wide", minZoom))
        }
        lenses.add(LensInfo("Main", 1.0f))
        if (maxZoom > 2.0f) {
            lenses.add(LensInfo("Tele", minOf(maxZoom, 5.0f)))
        }
        return lenses
    }

    fun setZoom(ratio: Float) {
        camera?.cameraControl?.setZoomRatio(ratio)
        Log.d("CameraHelper", "setZoom: $ratio")
    }

    private var zoomAnimator: ValueAnimator? = null

    fun getCurrentZoom(): Float {
        return camera?.cameraInfo?.zoomState?.value?.zoomRatio ?: 1.0f
    }

    fun getZoomRange(): Pair<Float, Float> {
        val zoomState = camera?.cameraInfo?.zoomState?.value
        val min = zoomState?.minZoomRatio ?: 1.0f
        val max = zoomState?.maxZoomRatio ?: 1.0f
        return Pair(min, max)
    }

    fun smoothZoomTo(targetRatio: Float, onUpdate: ((Float) -> Unit)? = null) {
        zoomAnimator?.cancel()
        val current = getCurrentZoom()
        val (min, max) = getZoomRange()
        val clamped = targetRatio.coerceIn(min, max)
        if (current == clamped) return

        zoomAnimator = ValueAnimator.ofFloat(current, clamped).apply {
            duration = 300L
            addUpdateListener { animator ->
                val value = animator.animatedValue as Float
                camera?.cameraControl?.setZoomRatio(value)
                onUpdate?.invoke(value)
            }
            start()
        }
    }

    fun getExposureRange(): Pair<Int, Int> {
        val state = camera?.cameraInfo?.exposureState
        val range = state?.exposureCompensationRange
        return Pair(range?.lower ?: 0, range?.upper ?: 0)
    }

    fun getCurrentExposure(): Int {
        return camera?.cameraInfo?.exposureState?.exposureCompensationIndex ?: 0
    }

    fun getExposureStep(): Float {
        return camera?.cameraInfo?.exposureState?.exposureCompensationStep?.toFloat() ?: 0f
    }

    fun setExposure(index: Int) {
        val (min, max) = getExposureRange()
        val clamped = index.coerceIn(min, max)
        camera?.cameraControl?.setExposureCompensationIndex(clamped)
    }

    fun stopCamera() {
        orientationListener.disable()
        cameraExecutor.shutdown()
    }

    companion object {
        const val INFERENCE_SIZE = 640
    }
}
