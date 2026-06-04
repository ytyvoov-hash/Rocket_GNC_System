# cad-converter

Standalone tool: **SolidWorks `.SLDPRT` / STEP → GLB + geometry JSON**.

Produces two outputs from a single input:
1. **`<id>.glb`** — Web-friendly 3D model for the GNC frontend (S3 thumbnails, S7 viewer).
2. **`<id>_geometry.json`** — Mesh analysis (surface area, volume, CG, inertia tensor, Aref) for cross-validating `rocket_properties.yaml`.

---

## Quick Start (CLI)

```bash
# From project root
python cad-converter/convert.py "data/BA(rocket_data_example)/stage1/BA.SLDPRT" --out-dir cad-converter/output
```

If your SolidWorks file is in millimetres:
```bash
python cad-converter/convert.py path/to/file.sldprt --scale 0.001
```

Output files end up in `cad-converter/output/`:
- `BA.glb`
- `BA_geometry.json`

---

## Install

```bash
pip install -r cad-converter/requirements.txt
```

**FreeCAD** is required for native SLDPRT support (it is not a pip package):
- Windows: https://www.freecad.org/downloads.php (install and ensure `FreeCADCmd.exe` is on PATH or in default install location).
- Linux: `apt install freecad` / `dnf install freecad`.
- Docker (Phase 3): bundled in the image — no host install needed.

**STEP files** (`.step` / `.stp`) can be converted **without FreeCAD** — `trimesh` handles them directly.

---

## Conversion Strategy

| Path | When used | Requires |
|---|---|---|
| **A** | FreeCAD importable from current Python | `python -c "import FreeCAD"` works |
| **B** | FreeCAD CLI on host | `FreeCADCmd` on PATH |
| **C** | STEP intermediate or pure-STEP input | trimesh only (for STEP); FreeCAD for SLDPRT→STEP |

The CLI tries each in order until one succeeds and reports `path_used` in the result.

---

## Verification Tests

```bash
pytest cad-converter/test_convert.py -v
```

8 assertions must pass:
- **1–4** GLB validity: file exists, magic bytes `glTF`, parses with trimesh, has ≥ 1 face.
- **5–8** Geometry sanity: JSON exists, surface_area > 0, centroid is 3 finite floats, Aref < total area.

---

## REST Server (Phase 2)

```bash
uvicorn cad-converter.server:app --port 5100
curl -F "file=@path/to/BA.SLDPRT" -F "rocket_id=BA" http://localhost:5100/convert
```

Endpoints:
- `GET  /health` — liveness check
- `POST /convert` — multipart upload, returns `{job_id, status, glb_url, geometry}`
- `GET  /status/{job_id}` — poll job status

---

## Geometry Output Schema

```json
{
  "surface_area_m2": 5.234,
  "volume_m3": 0.187,
  "centroid_m": [2.55, 0.0, 0.001],
  "inertia_tensor": [[...], [...], [...]],
  "aref_m2": 0.0785,
  "bounding_box_m": [5.45, 0.5, 0.5],
  "length_m": 5.45,
  "is_watertight": true,
  "face_count": 12450,
  "vertex_count": 6234
}
```

**Note on inertia:** computed at unit density. Multiply by your material density (kg/m³) to compare with `inertia_dry_kgm2` in the rocket template.

---

## Known Limitations

- **SLDPRT native import** requires FreeCAD with the OpenCASCADE-based importer. Some assembly/sheet-metal features may not import cleanly.
- **Mesh tessellation** uses FreeCAD's default deflection (0.1 mm). Fine details may be smoothed.
- **Volume = 0** means the mesh is not watertight — common for surface-modelled assemblies. Surface area and Aref are still valid.
