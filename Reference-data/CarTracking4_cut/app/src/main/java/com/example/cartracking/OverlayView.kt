package com.example.cartracking

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View

class OverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private var results: List<YoloDetector.BoundingBox> = emptyList()
    private var fps: Int = 0
    private var detectFps: Int = 0
    private var inferenceMs: Long = 0
    private var serialTimestamp: Long = 0

    fun setSerialTimestamp(ts: Long) {
        serialTimestamp = ts
        invalidate()
    }

    private val boxPaint = Paint().apply {
        color = Color.RED
        strokeWidth = 6f
        style = Paint.Style.STROKE
    }

    private fun drawBorder(
        canvas: Canvas,
        left: Float, top: Float, right: Float, bottom: Float,
        paint: Paint, r: Float, d: Float
    ) {
        val x1 = left; val y1 = top; val x2 = right; val y2 = bottom
        canvas.drawLine(x1 + r, y1, x1 + r + d, y1, paint)
        canvas.drawLine(x1, y1 + r, x1, y1 + r + d, paint)
        canvas.drawArc(RectF(x1, y1, x1 + 2f * r, y1 + 2f * r), 180f, 90f, false, paint)
        canvas.drawLine(x2 - r, y1, x2 - r - d, y1, paint)
        canvas.drawLine(x2, y1 + r, x2, y1 + r + d, paint)
        canvas.drawArc(RectF(x2 - 2f * r, y1, x2, y1 + 2f * r), 270f, 90f, false, paint)
        canvas.drawLine(x1 + r, y2, x1 + r + d, y2, paint)
        canvas.drawLine(x1, y2 - r, x1, y2 - r - d, paint)
        canvas.drawArc(RectF(x1, y2 - 2f * r, x1 + 2f * r, y2), 90f, 90f, false, paint)
        canvas.drawLine(x2 - r, y2, x2 - r - d, y2, paint)
        canvas.drawLine(x2, y2 - r, x2, y2 - r - d, paint)
        canvas.drawArc(RectF(x2 - 2f * r, y2 - 2f * r, x2, y2), 0f, 90f, false, paint)
    }

    private val textPaint = Paint().apply {
        color = Color.WHITE; textSize = 40f; style = Paint.Style.FILL
        setShadowLayer(5f, 0f, 0f, Color.BLACK)
    }
    private val sidePanelPaint = Paint().apply {
        color = Color.parseColor("#80000000"); style = Paint.Style.FILL
    }
    private val infoPaint = Paint().apply {
        color = Color.CYAN; textSize = 45f; isFakeBoldText = true; style = Paint.Style.FILL
        setShadowLayer(5f, 0f, 0f, Color.BLACK)
    }

    var isSquishedRecording = false

    // ── أبعاد الصورة المرئية بعد تدوير الكاميرا ──────────────────────────────────
    // تُضبط من MainActivity عبر setVisualDimensions().
    // الافتراضي: portrait (rotDeg=90) → visual W=2160, H=3840
    private var visualW: Float = 1080f
    private var visualH: Float = 1920f

    /**
     * يُستدعى من MainActivity مباشرةً بعد وصول نتائج onDetect/onEmptyDetect.
     * rotDeg  = cameraHelper.lastRotationDegrees
     * sensorW = cameraHelper.lastSensorWidth   (الأبعاد الخام، دائماً landscape: srcW > srcH)
     * sensorH = cameraHelper.lastSensorHeight
     */
    /** rotDeg ثابت=90 دائماً (شاشة portrait-locked) → visualW=sensorH=2160, visualH=sensorW=3840 */
    fun setVisualDimensions(rotDeg: Int, sensorW: Int, sensorH: Int) {
        visualW = sensorH.toFloat()  // 2160
        visualH = sensorW.toFloat()  // 3840
    }
    // ─────────────────────────────────────────────────────────────────────────────

    private var imageWidth: Int = 640
    private var imageHeight: Int = 640
    fun setImageDimensions(w: Int, h: Int) { imageWidth = w; imageHeight = h }

    private var baseFovX: Float = 47f
    private var baseFovY: Float = 80f
   // fun setCameraFov(fx: Float, fy: Float) { baseFovX = fx; baseFovY = fy }

    // ── متغيرات حساب معدل تغير الزاوية ──────────────────────────────────────────
    private var lastTimeMs: Long = 0
    private var lastAngleX: Float? = null
    private var lastAngleY: Float? = null
    private var rateAngleX: Float = 0f
    private var rateAngleY: Float = 0f
    private val rateAlpha: Float = 0.2f

    var outAngleX: Float = 0f; private set
    var outAngleY: Float = 0f; private set
    var outRateX: Float = 0f;  private set
    var outRateY: Float = 0f;  private set
    var outWidth: Int = 0;     private set
    var outHeight: Int = 0;    private set

    fun setResults(boundingBoxes: List<YoloDetector.BoundingBox>) {
        val currentTime = System.currentTimeMillis()
        if (boundingBoxes.isNotEmpty()) {
            val box = boundingBoxes[0]
            val normalizedCx = (box.x1 + box.x2) / 2f
            val normalizedCy = (box.y1 + box.y2) / 2f
            // الزاوية من مركز الصورة المرئية (0.5 = مركز)
            val currentAngleX = -(0.5f - normalizedCx) * baseFovX
            val currentAngleY =  (0.5f - normalizedCy) * baseFovY

            if (lastTimeMs > 0 && lastAngleX != null && lastAngleY != null) {
                val dt = (currentTime - lastTimeMs) / 1000f
                if (dt > 0.001f) {
                    val rawRateX = (currentAngleX - lastAngleX!!) / dt
                    val rawRateY = (currentAngleY - lastAngleY!!) / dt
                    rateAngleX = (rateAlpha * rawRateX) + ((1f - rateAlpha) * rateAngleX)
                    rateAngleY = (rateAlpha * rawRateY) + ((1f - rateAlpha) * rateAngleY)
                }
            } else {
                rateAngleX = 0f; rateAngleY = 0f
            }
            lastAngleX = currentAngleX; lastAngleY = currentAngleY

            outAngleX = currentAngleX; outAngleY = currentAngleY
            outRateX  = rateAngleX;   outRateY  = rateAngleY
            outWidth  = ((box.x2 - box.x1) * visualW).toInt()
            outHeight = ((box.y2 - box.y1) * visualH).toInt()
        } else {
            lastAngleX = null; lastAngleY = null
            rateAngleX = 0f;   rateAngleY = 0f
            outAngleX = 0f; outAngleY = 0f; outRateX = 0f; outRateY = 0f
            outWidth = 0;   outHeight = 0
        }
        lastTimeMs = currentTime
        results = boundingBoxes
        invalidate()
    }

    fun setFps(value: Int)           { fps = value;          invalidate() }
    fun setDetectFps(value: Int)     { detectFps = value;    invalidate() }
    fun setInferenceTime(ms: Long)   { inferenceMs = ms;     invalidate() }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val vw = width.toFloat()
        val vh = height.toFloat()

        // ── FILL_CENTER: كيف تظهر الصورة المرئية (visualW×visualH) على الشاشة (vw×vh) ──
        val camW = visualW
        val camH = visualH
        val scale  = maxOf(vw / camW, vh / camH)
        val dispW  = camW * scale       // قد يتجاوز vw (سيُقصّ)
        val dispH  = camH * scale
        val dispDx = (vw - dispW) / 2f  // سالب يعني القص من الجانبين
        val dispDy = (vh - dispH) / 2f

        // 1. لوحة معلومات جانبية
        if (results.isNotEmpty()) {
            canvas.drawRect(10f, 50f, 450f, 100f + (results.size * 170f) + 100f, sidePanelPaint)
        }

        // 2. عدد الأهداف + FPS
        canvas.drawText("Count: ${results.size}", 30f, 110f, infoPaint)
        canvas.drawText("FPS: $fps",    width - 250f, 60f,  infoPaint)
        canvas.drawText("DET: $detectFps", width - 250f, 115f, infoPaint)
        canvas.drawText("${inferenceMs}ms", width - 250f, 170f, infoPaint)
        canvas.drawText("T: $serialTimestamp", width - 250f, 225f, infoPaint)

        // 3. تقاطع مركز الشاشة (أصفر)
        val screenCenterX = vw / 2f
        val screenCenterY = vh / 2f
        val centerPaint = Paint().apply {
            color = Color.YELLOW; strokeWidth = 4f; style = Paint.Style.STROKE
        }
        // يمكنك تغيير هذا الرقم لزيادة طول أو عرض الصليب (مثلاً 60f أو 100f)
        val crossLength = 30f
        canvas.drawLine(screenCenterX - crossLength, screenCenterY, screenCenterX + crossLength, screenCenterY, centerPaint)
        canvas.drawLine(screenCenterX, screenCenterY - crossLength, screenCenterX, screenCenterY + crossLength, centerPaint)

        var yOffset = 180f

        for ((index, box) in results.withIndex()) {
            // ── تحويل إحداثيات [0,1] (فضاء الصورة المرئية) → بكسل الشاشة ──
            val left   = dispDx + box.x1 * dispW
            val top    = dispDy + box.y1 * dispH
            val right  = dispDx + box.x2 * dispW
            val bottom = dispDy + box.y2 * dispH

            val objWidth  = ((box.x2 - box.x1) * camW).toInt()
            val objHeight = ((box.y2 - box.y1) * camH).toInt()
            val sizeObject = objWidth + objHeight
            val d = (sizeObject / 10f).coerceAtLeast(10f)
            val r = 18f

            val targetScreenX = (left + right)  / 2f
            val targetScreenY = (top  + bottom) / 2f

            // خط من مركز الشاشة إلى الهدف
            val linePaint = Paint().apply {
                color = Color.YELLOW; strokeWidth = 3f; style = Paint.Style.STROKE; alpha = 150
            }
            canvas.drawLine(screenCenterX, screenCenterY, targetScreenX, targetScreenY, linePaint)

            val normalizedCx = (box.x1 + box.x2) / 2f
            val normalizedCy = (box.y1 + box.y2) / 2f

            // الخطأ بالبكسل من مركز الصورة المرئية
            val dx = -((0.5f - normalizedCx) * camW).toInt()
            val dy =  ((0.5f - normalizedCy) * camH).toInt()

            val angleX = -(0.5f - normalizedCx) * baseFovX
            val angleY =  (0.5f - normalizedCy) * baseFovY
         //   val angleX = dx / 47f
         //   val angleY =  dy / 55f

            // لوحة البيانات الجانبية
            canvas.drawText("${index + 1}. ${box.clsName}: ${objWidth}x${objHeight}", 30f, yOffset, textPaint); yOffset += 50f
            canvas.drawText("ErrPxl: X: $dx, Y: $dy",                                30f, yOffset, textPaint); yOffset += 50f
            canvas.drawText(
                "Angle: X: ${String.format(java.util.Locale.US, "%.1f", angleX)}°," +
                " Y: ${String.format(java.util.Locale.US, "%.1f", angleY)}°",
                30f, yOffset, textPaint
            ); yOffset += 50f
            if (index == 0) {
                canvas.drawText(
                    "Rate: X: ${String.format(java.util.Locale.US, "%.1f", rateAngleX)}°/s," +
                    " Y: ${String.format(java.util.Locale.US, "%.1f", rateAngleY)}°/s",
                    30f, yOffset, textPaint
                )
                yOffset += 50f
            }

            val realCarWidth = 1.8f // العرض التقريبي للسيارة بالمتر
            val focalLength = 800f  // البعد البؤري التقريبي
            val distance = if (objWidth > 0) (realCarWidth * focalLength) / objWidth.toFloat() else 0f
            val distanceStr = String.format(java.util.Locale.US, "%.1f", distance)

            canvas.drawText(
                "Di: ${distanceStr}m",
                30f,
                yOffset,
                textPaint
            )
            yOffset += 50f
            
            yOffset += 70f

            // رسم المربع
            drawBorder(canvas, left, top, right, bottom, boxPaint, r, d)
          /*  canvas.drawText(
                "${box.clsName} ${(box.cnf * 100).toInt()}%" +
                " | X:${String.format(java.util.Locale.US, "%.1f", angleX)}°" +
                " | R:${String.format(java.util.Locale.US, "%.1f", rateAngleX)}°/s",
                left,
                if (top > 50f) top - 10f else top + 50f,
                textPaint
            )*/
        }
    }
}
