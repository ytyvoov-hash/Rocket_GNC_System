package com.example.cartracking

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.Canvas
import android.net.Uri
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.util.Log
import android.view.View
import androidx.documentfile.provider.DocumentFile
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.OutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * التقاط مباشر من SurfaceView + GameView — بدون MediaProjection، بدون إذن
 * يدعم وضعين:
 *   1) File mode: حفظ مباشر عبر File (للهاتف)
 *   2) SAF mode: حفظ عبر DocumentFile/ContentResolver (للفلاش USB)
 * وضع الفلاش: الكتابة متزامنة (كل إطار يُكتَب ويُفرَّغ فوراً على الفلاش قبل الإطار التالي).
 */
object ScreenRecorder {

    private const val TAG = "ScreenRec"
    private const val CAPTURE_FPS = 10
    private const val JPEG_QUALITY = 82
    private const val FRAME_INTERVAL_MS = 1000L / CAPTURE_FPS
    /** للفلاش: عدم التقاط الإطار التالي قبل انتهاء كتابة الحالي (حفظ مباشر على القرص) */
    private const val SAF_WRITE_SYNC = true

    private var writeThread: HandlerThread? = null
    private var writeHandler: Handler? = null
    private var captureThread: HandlerThread? = null
    private var captureHandler: Handler? = null

    private val isRecording = AtomicBoolean(false)
    private val frameCount = AtomicInteger(0)

    // File mode
    private var sessionFolder: String = ""

    // SAF mode
    private var contentResolver: ContentResolver? = null
    private var sessionDocFolder: DocumentFile? = null
    private var useSaf = false

    private var overlayView: View? = null
    private var frameProvider: ((Bitmap) -> Boolean)? = null
    private var frameSizeProvider: (() -> IntArray)? = null
    private var reusableBitmap: Bitmap? = null

    /** وضع File — للحفظ على الهاتف */
    fun start(savePath: String, overlay: View, provider: (Bitmap) -> Boolean, sizeProvider: () -> IntArray) {
        if (isRecording.get()) return

        useSaf = false
        contentResolver = null
        sessionDocFolder = null

        overlayView = overlay
        frameProvider = provider
        frameSizeProvider = sizeProvider

        val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        sessionFolder = savePath + File.separator + "NanoTrack_" + timestamp
        val dir = File(sessionFolder)
        if (!dir.exists()) dir.mkdirs()

        frameCount.set(0)
        startThreads()

        isRecording.set(true)
        Log.i(TAG, "Recording [File] to: $sessionFolder @ ${CAPTURE_FPS}fps")
        captureHandler?.post(captureRunnable)
    }

    /**
     * وضع SAF — للحفظ على الفلاش USB.
     * @return true إذا بدأ التسجيل فعلاً، false إذا فشل (الوصول أو إنشاء المجلد).
     */
    fun startSaf(treeUri: Uri, resolver: ContentResolver, overlay: View, provider: (Bitmap) -> Boolean, sizeProvider: () -> IntArray, context: android.content.Context): Boolean {
        if (isRecording.get()) return false

        useSaf = true
        contentResolver = resolver
        sessionFolder = ""

        overlayView = overlay
        frameProvider = provider
        frameSizeProvider = sizeProvider

        val appContext = context.applicationContext
        var rootDoc = DocumentFile.fromTreeUri(appContext, treeUri)
        if (rootDoc == null) {
            rootDoc = DocumentFile.fromTreeUri(context, treeUri)
        }
        if (rootDoc == null) {
            Log.e(TAG, "DocumentFile.fromTreeUri null: $treeUri")
            return false
        }
        // عدم الاعتماد على exists() — على بعض الأجهزة يعيد false رغم وجود الإذن
        // الحفظ مباشرة في المجلد المحدد بدون إنشاء مجلد فرعي
        sessionDocFolder = rootDoc

        frameCount.set(0)
        startThreads()

        isRecording.set(true)
        Log.i(TAG, "Recording [SAF] direct to selected folder @ ${CAPTURE_FPS}fps")
        captureHandler?.post(captureRunnable)
        return true
    }

    fun stop() {
        isRecording.set(false)
        captureHandler?.removeCallbacksAndMessages(null)

        // انتظار كتابة جميع الإطارات المتبقية قبل إيقاف الخيط
        val wh = writeHandler
        if (wh != null) {
            val latch = java.util.concurrent.CountDownLatch(1)
            wh.post { latch.countDown() }
            try { latch.await(3, java.util.concurrent.TimeUnit.SECONDS) } catch (_: Exception) {}
        }

        captureThread?.quitSafely()
        captureThread = null
        captureHandler = null

        writeThread?.quitSafely()
        writeThread = null
        writeHandler = null

        overlayView = null
        frameProvider = null
        frameSizeProvider = null
        reusableBitmap?.recycle()
        reusableBitmap = null
        contentResolver = null
        sessionDocFolder = null

        Log.i(TAG, "Recording stopped. Total frames: ${frameCount.get()}")
    }

    fun isRecording(): Boolean = isRecording.get()

    private fun startThreads() {
        writeThread = HandlerThread("WriteThread").also { it.start() }
        writeHandler = Handler(writeThread!!.looper)

        captureThread = HandlerThread("CaptureThread").also { it.start() }
        captureHandler = Handler(captureThread!!.looper)
    }

    private val captureRunnable = object : Runnable {
        override fun run() {
            if (!isRecording.get()) return

            val scheduledInside = captureFrame()

            if (!scheduledInside) captureHandler?.postDelayed(this, FRAME_INTERVAL_MS)
        }
    }

    /**
     * @return true إذا تم جدولة الإطار التالي من الداخل (وضع الفلاش المتزامن)، وإلا false
     */
    private fun captureFrame(): Boolean {
        val provider = frameProvider ?: return false

        try {
            val size = frameSizeProvider?.invoke() ?: return false
            val w = size[0]
            val h = size[1]
            if (w <= 0 || h <= 0) return false

            var bmp = reusableBitmap
            if (bmp == null || bmp.width != w || bmp.height != h || bmp.isRecycled) {
                bmp?.recycle()
                bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                reusableBitmap = bmp
            }

            if (!provider(bmp)) return false

            val bitmap = bmp.copy(Bitmap.Config.ARGB_8888, true)
            val ov = overlayView

            // وضع الفلاش: كتابة متزامنة — كل إطار يُكتَب ويُفرَّغ على القرص قبل التقاط التالي
            if (useSaf && SAF_WRITE_SYNC) {
                val countHolder = intArrayOf(0)
                val latch = CountDownLatch(1)
                Handler(Looper.getMainLooper()).post {
                    try {
                        if (ov != null) {
                            val canvas = Canvas(bitmap)
                            val ovW = ov.width.toFloat()
                            val ovH = ov.height.toFloat()
                            if (ovW > 0 && ovH > 0) canvas.scale(w.toFloat() / ovW, h.toFloat() / ovH)
                            if (ov is OverlayView) ov.isSquishedRecording = true
                            ov.draw(canvas)
                            if (ov is OverlayView) ov.isSquishedRecording = false
                        }
                        countHolder[0] = frameCount.incrementAndGet()
                    } catch (e: Exception) { Log.e(TAG, "Overlay error", e) }
                    latch.countDown()
                }
                try { latch.await(2, TimeUnit.SECONDS) } catch (_: Exception) {}
                saveFrame(bitmap, countHolder[0])
                captureHandler?.postDelayed(captureRunnable, FRAME_INTERVAL_MS)
                return true
            }

            val count = frameCount.incrementAndGet()
            if (ov != null) {
                Handler(Looper.getMainLooper()).post {
                    try {
                        val canvas = Canvas(bitmap)
                        val ovW = ov.width.toFloat()
                        val ovH = ov.height.toFloat()
                        if (ovW > 0 && ovH > 0) canvas.scale(w.toFloat() / ovW, h.toFloat() / ovH)
                        if (ov is OverlayView) ov.isSquishedRecording = true
                        ov.draw(canvas)
                        if (ov is OverlayView) ov.isSquishedRecording = false
                    } catch (_: Exception) {}
                    writeHandler?.post { saveFrame(bitmap, count) }
                }
            } else {
                writeHandler?.post { saveFrame(bitmap, count) }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Capture error", e)
        }
        return false
    }

    private fun saveFrame(bitmap: Bitmap, count: Int) {
        val filename = String.format(Locale.US, "frame_%06d.jpg", count)

        if (useSaf) {
            saveFrameSaf(bitmap, count, filename)
        } else {
            saveFrameFile(bitmap, count, filename)
        }
    }

    private fun saveFrameFile(bitmap: Bitmap, count: Int, filename: String) {
        val file = File(sessionFolder, filename)
        var fos: FileOutputStream? = null
        try {
            fos = FileOutputStream(file)
            bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, fos)
            fos.flush()
            fos.fd.sync()
            fos.close()
            fos = null
        } catch (e: IOException) {
            Log.e(TAG, "Error saving frame $count", e)
        } finally {
            try { fos?.close() } catch (_: IOException) {}
            bitmap.recycle()
        }
    }

    private fun saveFrameSaf(bitmap: Bitmap, count: Int, filename: String) {
        var os: OutputStream? = null
        var pfd: ParcelFileDescriptor? = null
        try {
            val docFile = sessionDocFolder?.createFile("image/jpeg", filename)
            if (docFile == null) {
                Log.e(TAG, "Failed to create SAF file: $filename")
                bitmap.recycle()
                return
            }
            val resolver = contentResolver ?: run {
                bitmap.recycle()
                return
            }
            pfd = resolver.openFileDescriptor(docFile.uri, "w")
            if (pfd == null) {
                bitmap.recycle()
                return
            }
            os = FileOutputStream(pfd.fileDescriptor)
            bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, os)
            os.flush()
            pfd.fileDescriptor.sync()
            os.close()
            os = null
            pfd.close()
            pfd = null
        } catch (e: Exception) {
            Log.e(TAG, "Error saving SAF frame $count", e)
        } finally {
            try { os?.close() } catch (_: Exception) {}
            try { pfd?.close() } catch (_: Exception) {}
            bitmap.recycle()
        }
    }
}
