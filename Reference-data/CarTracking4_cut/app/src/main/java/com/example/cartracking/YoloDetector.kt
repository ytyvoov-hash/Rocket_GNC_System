package com.example.cartracking

import android.content.Context
import android.os.SystemClock
import android.util.Log
import org.tensorflow.lite.DataType
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.gpu.GpuDelegate
import org.tensorflow.lite.nnapi.NnApiDelegate
import org.tensorflow.lite.support.common.FileUtil
import org.tensorflow.lite.support.common.ops.NormalizeOp
import org.tensorflow.lite.support.image.ImageProcessor
import org.tensorflow.lite.support.image.TensorImage
import org.tensorflow.lite.support.image.ops.ResizeOp
import org.tensorflow.lite.support.tensorbuffer.TensorBuffer
import java.io.BufferedReader
import java.io.InputStreamReader
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

class YoloDetector(
    private val context: Context,
    private val modelPath: String,
    private val labelPath: String?,
    private val detectorListener: DetectorListener,
    private val acceleration: Acceleration = Acceleration.AUTO
) {
    private var interpreter: Interpreter? = null
    private var labels = mutableListOf<String>()

    private var loggedNoInterpreter = false
    private var loggedAssets = false

    private var gpuDelegate: GpuDelegate? = null
    private var nnApiDelegate: NnApiDelegate? = null

    private var tensorWidth = 0
    private var tensorHeight = 0
    private var numChannel = 0
    private var numElements = 0

    private var outputShape: IntArray = intArrayOf(1, 84, 8400)
    private var outputTensorCount: Int = 1

    private var inputDataType: DataType = DataType.FLOAT32
    private var outputDataType: DataType = DataType.FLOAT32
    private lateinit var imageProcessor: ImageProcessor

    // معاملات التكميم للإدخال (إذا كان UINT8)
    private var inputScale = 1.0f
    private var inputZeroPoint = 0

    // معاملات التكميم للإخراج (إذا كان UINT8)
    private var outputScale = 1.0f
    private var outputZeroPoint = 0

    private var inputBuffer: ByteBuffer? = null
    private var inputFloatBuffer: FloatBuffer? = null
    private var reusableResizedRgb: ByteArray? = null
    private var normalizeFloats: FloatArray? = null

    // Buffers for output (separate for float and quantized)
    private var outputBufferBytes: ByteBuffer? = null   // for UINT8
    private var outputBufferFloats: TensorBuffer? = null // for FLOAT32

    // Pre-computed lookup table: byte value (0-255) → normalized float (0.0-1.0)
    private val normLut = FloatArray(256) { it / 255f }

    init {
        try {
            val numCores = Runtime.getRuntime().availableProcessors()
            val options = Interpreter.Options().apply { setNumThreads(numCores) }
            Log.d("YOLO", "Using $numCores CPU threads")

            if (!loggedAssets) {
                loggedAssets = true
                try {
                    val assets = context.assets.list("")?.toList().orEmpty()
                    Log.d("YOLO", "assets=${assets.joinToString()}")
                } catch (t: Throwable) {
                    Log.w("YOLO", "Failed to list assets", t)
                }
            }

            when (acceleration) {
                Acceleration.GPU -> {
                    try {
                        val gpuOptions = GpuDelegate.Options().apply {
                            setPrecisionLossAllowed(true)
                            setInferencePreference(GpuDelegate.Options.INFERENCE_PREFERENCE_SUSTAINED_SPEED)
                        }
                        gpuDelegate = GpuDelegate(gpuOptions)
                        options.addDelegate(gpuDelegate)
                        Log.d("YOLO", "GPU delegate enabled (FP16, sustained speed)")
                    } catch (e: Throwable) {
                        Log.e("YOLO", "GPU delegate FAILED: ${e.javaClass.simpleName}: ${e.message}")
                        gpuDelegate = null
                    }
                }
                Acceleration.NNAPI -> {
                    try {
                        val nnApiOptions = NnApiDelegate.Options().apply {
                            setExecutionPreference(NnApiDelegate.Options.EXECUTION_PREFERENCE_SUSTAINED_SPEED)
                            setAllowFp16(true)
                            setUseNnapiCpu(false)
                        }
                        nnApiDelegate = NnApiDelegate(nnApiOptions)
                        options.addDelegate(nnApiDelegate)
                        Log.d("YOLO", "NNAPI delegate enabled (NPU/HTP, sustained speed, FP16 allowed)")
                    } catch (e: Throwable) {
                        Log.e("YOLO", "NNAPI delegate FAILED: ${e.javaClass.simpleName}: ${e.message}")
                        nnApiDelegate = null
                    }
                }
                Acceleration.AUTO -> {
                    try {
                        val gpuOptions = GpuDelegate.Options().apply {
                            setPrecisionLossAllowed(true)
                            setInferencePreference(GpuDelegate.Options.INFERENCE_PREFERENCE_SUSTAINED_SPEED)
                        }
                        gpuDelegate = GpuDelegate(gpuOptions)
                        options.addDelegate(gpuDelegate)
                        Log.d("YOLO", "AUTO: GPU delegate enabled (FP16)")
                    } catch (e: Throwable) {
                        Log.w("YOLO", "AUTO: GPU failed (${e.message}), using CPU+XNNPACK")
                        gpuDelegate = null
                    }
                }
                Acceleration.CPU -> Unit
            }

            // Quick sanity check: read first bytes to catch HTML/Xet pointer files.
            try {
                context.assets.open(modelPath).use { input ->
                    val header = ByteArray(8)
                    val read = input.read(header)
                    if (read > 0) {
                        val ascii = header.take(read).map { b ->
                            val c = (b.toInt() and 0xFF)
                            if (c in 32..126) c.toChar() else '.'
                        }.joinToString("")
                        val hex = header.take(read).joinToString(" ") { b -> "%02X".format(b) }
                        Log.d("YOLO", "model header ascii='$ascii' hex=$hex")
                    } else {
                        Log.e("YOLO", "model asset is empty: $modelPath")
                    }
                }
            } catch (t: Throwable) {
                Log.e("YOLO", "Failed to open model asset: $modelPath", t)
            }

            val model = try {
                FileUtil.loadMappedFile(context, modelPath)
            } catch (t: Throwable) {
                Log.e("YOLO", "FileUtil.loadMappedFile failed for modelPath=$modelPath", t)
                throw t
            }
            interpreter = Interpreter(model, options)

            val inputTensor = interpreter?.getInputTensor(0)
            val inputShape = inputTensor?.shape() ?: intArrayOf(1, 640, 640, 3)
            inputDataType = inputTensor?.dataType() ?: DataType.FLOAT32
            if (inputDataType == DataType.UINT8) {
                val qParams = inputTensor?.quantizationParams()
                inputScale = qParams?.scale ?: 1.0f
                inputZeroPoint = qParams?.zeroPoint ?: 0
                Log.d("YOLO", "Input quantization: scale=$inputScale, zeroPoint=$inputZeroPoint")
            }
            Log.d("YOLO", "Input tensor shape=${inputShape.contentToString()} type=$inputDataType")

            tensorWidth = inputShape[1]
            tensorHeight = inputShape[2]

            val outputTensor = interpreter?.getOutputTensor(0)
            outputShape = outputTensor?.shape() ?: intArrayOf(1, 84, 8400)
            outputDataType = outputTensor?.dataType() ?: DataType.FLOAT32
            if (outputDataType == DataType.UINT8) {
                val qParams = outputTensor?.quantizationParams()
                outputScale = qParams?.scale ?: 1.0f
                outputZeroPoint = qParams?.zeroPoint ?: 0
                Log.d("YOLO", "Output quantization: scale=$outputScale, zeroPoint=$outputZeroPoint")
            }
            Log.d("YOLO", "Output tensor shape=${outputShape.contentToString()} type=$outputDataType")
            outputTensorCount = interpreter?.outputTensorCount ?: 1
            Log.d("YOLO", "Output tensor count=$outputTensorCount")

            numChannel = outputShape[1]
            numElements = outputShape[2]

            val processorBuilder = ImageProcessor.Builder()
                .add(ResizeOp(tensorHeight, tensorWidth, ResizeOp.ResizeMethod.BILINEAR))

            if (inputDataType == DataType.FLOAT32) {
                processorBuilder.add(NormalizeOp(0f, 255f))
            }
            imageProcessor = processorBuilder.build()

            // Pre-allocate input buffer
            val inputSize = tensorWidth * tensorHeight * 3
            inputBuffer = when (inputDataType) {
                DataType.FLOAT32 -> ByteBuffer.allocateDirect(inputSize * 4).order(ByteOrder.nativeOrder())
                DataType.UINT8 -> ByteBuffer.allocateDirect(inputSize).order(ByteOrder.nativeOrder())
                else -> ByteBuffer.allocateDirect(inputSize * 4).order(ByteOrder.nativeOrder())
            }

            // Pre-allocate output buffers based on data type
            if (outputDataType == DataType.UINT8) {
                val outputSize = outputShape.fold(1) { acc, i -> acc * i }
                outputBufferBytes = ByteBuffer.allocateDirect(outputSize).order(ByteOrder.nativeOrder())
                outputBufferFloats = null
                Log.d("YOLO", "Allocated ByteBuffer for UINT8 output, size=$outputSize bytes")
            } else {
                outputBufferFloats = TensorBuffer.createFixedSize(outputShape, DataType.FLOAT32)
                outputBufferBytes = null
                Log.d("YOLO", "Allocated TensorBuffer for FLOAT32 output")
            }

            loadLabels()
        } catch (e: Exception) {
            Log.e("YOLO", "Initialization failed", e)
            interpreter = null
        }
    }

    private fun loadLabels() {
        try {
            labelPath?.let {
                val inputStream = context.assets.open(it)
                val reader = BufferedReader(InputStreamReader(inputStream))
                var line: String? = reader.readLine()
                while (line != null) {
                    if (line.isNotBlank()) labels.add(line)
                    line = reader.readLine()
                }
                reader.close()
                inputStream.close()
            }
        } catch (e: Exception) {
            Log.e("YOLO", "Label loading failed: ${e.message}")
            for (i in 0..80) labels.add("Object $i")
        }
        if (labels.isEmpty()) {
            labels.add("car")
            Log.w("YOLO", "No labels found, using default 'car'")
        }
    }

    fun detectRgb(rgbBytes: ByteArray, width: Int, height: Int) {
        val currentInterpreter = interpreter
        if (currentInterpreter == null) {
            if (!loggedNoInterpreter) {
                loggedNoInterpreter = true
                Log.e("YOLO", "detectRgb called but interpreter is null. Model init likely failed (modelPath=$modelPath)")
            }
            return
        }

        val inputRgb: ByteArray = if (width == tensorWidth && height == tensorHeight) {
            rgbBytes
        } else {
            val required = tensorWidth * tensorHeight * 3
            val dst = reusableResizedRgb?.takeIf { it.size == required } ?: ByteArray(required)
            reusableResizedRgb = dst
            resizeRgbNearest(rgbBytes, width, height, dst, tensorWidth, tensorHeight)
            dst
        }

        var inferenceTime = SystemClock.uptimeMillis()

        val inBuffer = inputBuffer ?: return
        inBuffer.rewind()

        // Prepare input
        when (inputDataType) {
            DataType.FLOAT32 -> {
                val floatCount = inputRgb.size
                val floats = normalizeFloats?.takeIf { it.size == floatCount }
                    ?: FloatArray(floatCount).also { normalizeFloats = it }
                val lut = normLut
                var i = 0
                while (i < floatCount) {
                    floats[i] = lut[inputRgb[i].toInt() and 0xFF]
                    floats[i + 1] = lut[inputRgb[i + 1].toInt() and 0xFF]
                    floats[i + 2] = lut[inputRgb[i + 2].toInt() and 0xFF]
                    i += 3
                }
                val fb = inputFloatBuffer ?: inBuffer.asFloatBuffer().also { inputFloatBuffer = it }
                fb.rewind()
                fb.put(floats, 0, floatCount)
            }
            DataType.UINT8 -> {
                inBuffer.put(inputRgb, 0, inputRgb.size)
            }
            else -> {
                val floatCount = inputRgb.size
                val floats = normalizeFloats?.takeIf { it.size == floatCount }
                    ?: FloatArray(floatCount).also { normalizeFloats = it }
                val lut = normLut
                var i = 0
                while (i < floatCount) {
                    floats[i] = lut[inputRgb[i].toInt() and 0xFF]
                    i++
                }
                val fb = inputFloatBuffer ?: inBuffer.asFloatBuffer().also { inputFloatBuffer = it }
                fb.rewind()
                fb.put(floats, 0, floatCount)
            }
        }

        val isSingleBoxesOutput = outputShape.size == 3 && outputShape[0] == 1 && outputShape[2] == 4
        val isSsdMultiOutput = outputTensorCount >= 4

        val bestBoxes: List<BoundingBox>? = if (isSsdMultiOutput) {
            handleSsdMultiOutput(currentInterpreter)
        } else if (isSingleBoxesOutput) {
            handleSsdSingleOutput(currentInterpreter)
        } else {
            handleYoloOutput(currentInterpreter)
        }

        inferenceTime = SystemClock.uptimeMillis() - inferenceTime

        if (bestBoxes == null || bestBoxes.isEmpty()) {
            detectorListener.onEmptyDetect()
            return
        }

        detectorListener.onDetect(bestBoxes, inferenceTime)
    }

    private fun handleYoloOutput(currentInterpreter: Interpreter): List<BoundingBox>? {
        val floatArray: FloatArray = when (outputDataType) {
            DataType.FLOAT32 -> {
                val buf = outputBufferFloats ?: return null
                buf.buffer.rewind()
                currentInterpreter.run(inputBuffer, buf.buffer)
                val arr = buf.floatArray
                Log.d("YOLO", "FLOAT32 output array size: ${arr.size}")
                arr
            }
            DataType.UINT8 -> {
                val byteBuf = outputBufferBytes ?: return null
                byteBuf.rewind()
                currentInterpreter.run(inputBuffer, byteBuf)
                val size = byteBuf.remaining()
                if (size == 0) {
                    Log.e("YOLO", "UINT8 output buffer is empty after run")
                    return null
                }
                Log.d("YOLO", "UINT8 output buffer size: $size bytes")
                val floats = FloatArray(size)
                val tempBytes = ByteArray(size)
                byteBuf.rewind()
                byteBuf.get(tempBytes)
                for (i in tempBytes.indices) {
                    val quant = tempBytes[i].toInt() and 0xFF
                    floats[i] = (quant - outputZeroPoint) * outputScale
                }
                floats
            }
            else -> {
                Log.e("YOLO", "Unsupported output data type: $outputDataType")
                return null
            }
        }

        if (floatArray.isEmpty()) {
            Log.e("YOLO", "floatArray is empty after dequantization")
            return null
        }

        return processOutput(floatArray)
    }

    private fun handleSsdMultiOutput(currentInterpreter: Interpreter): List<BoundingBox>? {
        Log.d("YOLO", "run(): start SSD-multi input=${tensorWidth}x${tensorHeight} outputCount=$outputTensorCount")

        val nShape = currentInterpreter.getOutputTensor(0)?.shape()
        val n = nShape?.getOrNull(1) ?: 10
        val outBoxes = Array(1) { Array(n) { FloatArray(4) } }
        val outClasses = Array(1) { FloatArray(n) }
        val outScores = Array(1) { FloatArray(n) }
        val outNum = FloatArray(1)

        val outputs = HashMap<Int, Any>(4)
        outputs[0] = outBoxes
        outputs[1] = outClasses
        outputs[2] = outScores
        outputs[3] = outNum

        val ok = try {
            currentInterpreter.runForMultipleInputsOutputs(arrayOf(inputBuffer), outputs)
            true
        } catch (t: Throwable) {
            Log.e("YOLO", "SSD-multi run failed", t)
            false
        }

        if (!ok) return null

        Log.d("YOLO", "run(): end SSD-multi numDet=${outNum[0]}")
        val count = outNum[0].toInt().coerceIn(0, n)
        val list = mutableListOf<BoundingBox>()
        for (i in 0 until count) {
            val score = outScores[0][i]
            val cls = outClasses[0][i].toInt()
            val box = outBoxes[0][i]
            Log.d("YOLO", "  SSD[$i] score=${"%.3f".format(score)} cls=$cls box=[${box.joinToString { "%.4f".format(it) }}]")
            val y1 = box[0]
            val x1 = box[1]
            val y2 = box[2]
            val x2 = box[3]
            val clsName = labels.getOrNull(cls) ?: "Unknown"
            list.add(
                BoundingBox(
                    x1 = x1.coerceIn(0f, 1f),
                    y1 = y1.coerceIn(0f, 1f),
                    x2 = x2.coerceIn(0f, 1f),
                    y2 = y2.coerceIn(0f, 1f),
                    cx = (x1 + x2) / 2f,
                    cy = (y1 + y2) / 2f,
                    w = (x2 - x1),
                    h = (y2 - y1),
                    cnf = score,
                    cls = cls,
                    clsName = clsName
                )
            )
        }
        return list
    }

    private fun handleSsdSingleOutput(currentInterpreter: Interpreter): List<BoundingBox>? {
        val output = TensorBuffer.createFixedSize(outputShape, DataType.FLOAT32)
        Log.d("YOLO", "run(): start SSD-single input=${tensorWidth}x${tensorHeight} outputShape=${outputShape.contentToString()}")
        currentInterpreter.run(inputBuffer, output.buffer)
        Log.d("YOLO", "run(): end SSD-single")

        val floats = output.floatArray
        val n = outputShape[1]
        val list = mutableListOf<BoundingBox>()
        for (i in 0 until n) {
            val base = i * 4
            if (base + 3 >= floats.size) break
            val a = floats[base]
            val b = floats[base + 1]
            val c = floats[base + 2]
            val d = floats[base + 3]

            val y1 = a
            val x1 = b
            val y2 = c
            val x2 = d

            val cls = 0
            val clsName = labels.getOrNull(cls) ?: "Unknown"
            list.add(
                BoundingBox(
                    x1 = x1.coerceIn(0f, 1f),
                    y1 = y1.coerceIn(0f, 1f),
                    x2 = x2.coerceIn(0f, 1f),
                    y2 = y2.coerceIn(0f, 1f),
                    cx = (x1 + x2) / 2f,
                    cy = (y1 + y2) / 2f,
                    w = (x2 - x1),
                    h = (y2 - y1),
                    cnf = 1.0f,
                    cls = cls,
                    clsName = clsName
                )
            )
        }
        return list
    }

    private fun resizeRgbNearest(
        src: ByteArray,
        srcW: Int,
        srcH: Int,
        dst: ByteArray,
        dstW: Int,
        dstH: Int
    ) {
        val xRatio = srcW.toFloat() / dstW.toFloat()
        val yRatio = srcH.toFloat() / dstH.toFloat()
        var di = 0
        for (y in 0 until dstH) {
            val sy = (y * yRatio).toInt().coerceIn(0, srcH - 1)
            for (x in 0 until dstW) {
                val sx = (x * xRatio).toInt().coerceIn(0, srcW - 1)
                val si = (sy * srcW + sx) * 3
                dst[di] = src[si]
                dst[di + 1] = src[si + 1]
                dst[di + 2] = src[si + 2]
                di += 3
            }
        }
    }

    private fun processOutput(array: FloatArray): List<BoundingBox>? {
        if (array.isEmpty()) {
            Log.e("YOLO", "processOutput: array is empty")
            return null
        }

        val boundingBoxes = mutableListOf<BoundingBox>()

        val expectedChannelsNoObj = 4 + labels.size
        val expectedChannelsWithObj = 5 + labels.size
        val channelDim = outputShape.getOrNull(1) ?: numChannel
        val elementDim = outputShape.getOrNull(2) ?: numElements

        val channels: Int
        val elements: Int
        val isChannelFirst: Boolean
        when {
            channelDim == expectedChannelsNoObj || channelDim == expectedChannelsWithObj -> {
                channels = channelDim; elements = elementDim; isChannelFirst = true
            }
            elementDim == expectedChannelsNoObj || elementDim == expectedChannelsWithObj -> {
                channels = elementDim; elements = channelDim; isChannelFirst = false
            }
            else -> {
                if (channelDim > elementDim) {
                    channels = elementDim; elements = channelDim; isChannelFirst = false
                    Log.d("YOLO", "processOutput: shape heuristic → detection-first (YOLOv5), channels=$channels elements=$elements")
                } else {
                    channels = channelDim; elements = elementDim; isChannelFirst = true
                    Log.d("YOLO", "processOutput: shape heuristic → channel-first (YOLOv8), channels=$channels elements=$elements")
                }
            }
        }

        val expectedArraySize = if (isChannelFirst) elements * channels else channels * elements
        if (array.size < expectedArraySize) {
            Log.e("YOLO", "Array size mismatch: expected $expectedArraySize, got ${array.size}")
            return null
        }

        val hasObjectness = when {
            channels == expectedChannelsWithObj -> true
            channels == expectedChannelsNoObj -> false
            !isChannelFirst && channels >= 6 -> true
            else -> false
        }
        val clsStart = if (hasObjectness) 5 else 4

        for (c in 0 until elements) {
            val obj = if (hasObjectness) {
                val idx = if (isChannelFirst) c + elements * 4 else 4 + channels * c
                if (idx >= array.size) break
                array[idx]
            } else 1.0f

            if (obj < CONFIDENCE_THRESHOLD) continue

            var maxConf = -1.0f
            var maxIdx = -1
            for (j in clsStart until channels) {
                val idx = if (isChannelFirst) c + elements * j else j + channels * c
                if (idx >= array.size) break
                val conf = array[idx]
                if (conf > maxConf) {
                    maxConf = conf
                    maxIdx = j - clsStart
                }
            }

            val finalConf = obj * maxConf
            if (finalConf < CONFIDENCE_THRESHOLD) continue

            val idxCx = if (isChannelFirst) c + elements * 0 else 0 + channels * c
            val idxCy = if (isChannelFirst) c + elements * 1 else 1 + channels * c
            val idxW  = if (isChannelFirst) c + elements * 2 else 2 + channels * c
            val idxH  = if (isChannelFirst) c + elements * 3 else 3 + channels * c

            if (idxCx >= array.size || idxCy >= array.size || idxW >= array.size || idxH >= array.size) continue

            val cx = array[idxCx]
            val cy = array[idxCy]
            val w  = array[idxW]
            val h  = array[idxH]

            val coordsArePixels = (cx > 1f) || (cy > 1f) || (w > 1f) || (h > 1f)
            val xScale = if (coordsArePixels) tensorWidth.toFloat() else 1f
            val yScale = if (coordsArePixels) tensorHeight.toFloat() else 1f

            val x1 = (cx - w / 2f) / xScale
            val y1 = (cy - h / 2f) / yScale
            val x2 = (cx + w / 2f) / xScale
            val y2 = (cy + h / 2f) / yScale

            if (x1 < 0f && x2 < 0f) continue

            boundingBoxes.add(
                BoundingBox(
                    x1 = x1.coerceIn(0f, 1f),
                    y1 = y1.coerceIn(0f, 1f),
                    x2 = x2.coerceIn(0f, 1f),
                    y2 = y2.coerceIn(0f, 1f),
                    cx = cx, cy = cy, w = w, h = h,
                    cnf = finalConf, cls = maxIdx, clsName = labels.getOrNull(maxIdx) ?: "Unknown"
                )
            )
        }

        if (boundingBoxes.isEmpty()) return null
        return applyNMS(boundingBoxes)
    }

    private fun applyNMS(boxes: List<BoundingBox>): List<BoundingBox> {
        val sortedBoxes = boxes.sortedByDescending { it.cnf }.toMutableList()
        val selectedBoxes = mutableListOf<BoundingBox>()

        while (sortedBoxes.isNotEmpty()) {
            val first = sortedBoxes.first()
            selectedBoxes.add(first)
            sortedBoxes.remove(first)

            val iterator = sortedBoxes.iterator()
            while (iterator.hasNext()) {
                val next = iterator.next()
                if (calculateIoU(first, next) >= IOU_THRESHOLD) {
                    iterator.remove()
                }
            }
        }
        return selectedBoxes
    }

    private fun calculateIoU(box1: BoundingBox, box2: BoundingBox): Float {
        val x1 = maxOf(box1.x1, box2.x1)
        val y1 = maxOf(box1.y1, box2.y1)
        val x2 = minOf(box1.x2, box2.x2)
        val y2 = minOf(box1.y2, box2.y2)
        val intersectionArea = maxOf(0F, x2 - x1) * maxOf(0F, y2 - y1)
        val box1Area = (box1.x2 - box1.x1) * (box1.y2 - box1.y1)
        val box2Area = (box2.x2 - box2.x1) * (box2.y2 - box2.y1)
        val unionArea = box1Area + box2Area - intersectionArea
        return if (unionArea > 0) intersectionArea / unionArea else 0f
    }

    fun close() {
        interpreter?.close()
        interpreter = null

        try {
            gpuDelegate?.close()
        } catch (_: Throwable) {
        }
        gpuDelegate = null

        try {
            nnApiDelegate?.close()
        } catch (_: Throwable) {
        }
        nnApiDelegate = null
    }

    interface DetectorListener {
        fun onEmptyDetect()
        fun onDetect(boundingBoxes: List<BoundingBox>, inferenceTime: Long)
    }

    data class BoundingBox(
        val x1: Float, val y1: Float, val x2: Float, val y2: Float,
        val cx: Float, val cy: Float, val w: Float, val h: Float,
        val cnf: Float, val cls: Int, val clsName: String
    )

    companion object {
        private const val CONFIDENCE_THRESHOLD = 0.45F   // كانت 0.35F
        private const val IOU_THRESHOLD = 0.2F
    }

    enum class Acceleration {
        CPU,
        GPU,
        NNAPI,
        AUTO
    }
}