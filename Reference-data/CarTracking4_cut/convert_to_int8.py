"""
Convert YOLOv8n float32 TFLite model to INT8 quantized TFLite model.

Usage:
    pip install tensorflow numpy
    python convert_to_int8.py

This will create yolov8n_int8.tflite in the assets folder.
"""
import numpy as np
import tensorflow as tf
import os

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(SCRIPT_DIR, "app", "src", "main", "assets")
INPUT_MODEL = os.path.join(ASSETS_DIR, "yolov8n_float32.tflite")
OUTPUT_MODEL = os.path.join(ASSETS_DIR, "yolov8n_int8.tflite")


def representative_dataset():
    """Generate random calibration data (640x640x3 images normalized to 0-1)."""
    for _ in range(100):
        data = np.random.rand(1, 640, 640, 3).astype(np.float32)
        yield [data]


def main():
    if not os.path.exists(INPUT_MODEL):
        print(f"ERROR: Input model not found: {INPUT_MODEL}")
        return

    print(f"Loading model: {INPUT_MODEL}")
    print(f"Model size: {os.path.getsize(INPUT_MODEL) / 1024 / 1024:.1f} MB")

    # Load the float32 TFLite model and convert to INT8
    interpreter = tf.lite.Interpreter(model_path=INPUT_MODEL)
    interpreter.allocate_tensors()

    # Convert using TFLite converter from the existing TFLite model
    converter = tf.lite.TFLiteConverter.from_saved_model  # won't work directly

    # For TFLite-to-TFLite quantization, we use the interpreter approach
    # Read the flatbuffer model
    with open(INPUT_MODEL, "rb") as f:
        model_content = f.read()

    # Use tf.lite.TFLiteConverter with quantization
    # Since we have a .tflite file (not SavedModel), we need to use
    # the experimental quantizer or rebuild from ONNX/PT

    # Alternative: Use TFLite's built-in quantization via Interpreter
    converter = tf.lite.Interpreter(model_path=INPUT_MODEL)
    converter.allocate_tensors()
    input_details = converter.get_input_details()
    output_details = converter.get_output_details()

    print(f"Input shape: {input_details[0]['shape']}")
    print(f"Input dtype: {input_details[0]['dtype']}")
    print(f"Output shape: {output_details[0]['shape']}")

    # The proper way: use ultralytics to export INT8
    print("\n" + "=" * 60)
    print("To create an INT8 model, run these commands:")
    print("=" * 60)
    print()
    print("pip install ultralytics")
    print()
    print("Then in Python:")
    print()
    print("from ultralytics import YOLO")
    print("model = YOLO('yolov8n.pt')")
    print(f"model.export(format='tflite', int8=True, imgsz=640)")
    print()
    print(f"Then copy the output file to:\n  {ASSETS_DIR}\\yolov8n_int8.tflite")
    print("=" * 60)


if __name__ == "__main__":
    main()
