"""
Export YOLOv8n to TFLite (float32, 640x640)
============================================
Usage:
    1. pip install ultralytics
    2. python export_yolov8.py
    3. Copy the output file to:
       app/src/main/assets/yolov8n_float32.tflite
"""

from ultralytics import YOLO

# Load pretrained YOLOv8n (nano - smallest & fastest, ~6MB)
model = YOLO("yolov8n.pt")

# Export to TFLite float32 at 640x640
model.export(
    format="tflite",
    imgsz=640,
    half=False,       # float32 (not float16)
    int8=False,       # no quantization
)

print("\n✅ Export complete!")
print("Output file: yolov8n_saved_model/yolov8n_float32.tflite")
print("\nNext step: copy it to app/src/main/assets/yolov8n_float32.tflite")
