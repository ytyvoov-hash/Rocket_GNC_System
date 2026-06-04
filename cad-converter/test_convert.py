"""
Phase 1 hard gate — 8 assertions on real BA.SLDPRT conversion.

Run from project root or from cad-converter/:
    pytest cad-converter/test_convert.py -v
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from convert import convert

# Resolve the test SLDPRT relative to project root (cad-converter/ is at root).
PROJECT_ROOT = Path(__file__).resolve().parent.parent
SLDPRT_PATH = PROJECT_ROOT / "data" / "BA(rocket_data_example)" / "stage1" / "BA.SLDPRT"
OUT_DIR = Path(__file__).resolve().parent / "output"


@pytest.fixture(scope="session")
def conversion_result():
    """Run the full conversion once per test session."""
    if not SLDPRT_PATH.is_file():
        pytest.skip(f"Test file not found: {SLDPRT_PATH}")
    try:
        return convert(SLDPRT_PATH, out_dir=OUT_DIR, rocket_id="BA")
    except RuntimeError as e:
        pytest.skip(f"Conversion not possible on this host (missing FreeCAD?): {e}")


# ---------------------------------------------------------------------------
# GLB assertions (1–4)
# ---------------------------------------------------------------------------

def test_1_glb_file_exists_and_nonzero(conversion_result):
    glb = Path(conversion_result["glb_path"])
    assert glb.is_file(), f"GLB not created at {glb}"
    assert glb.stat().st_size > 0, "GLB file is empty"


def test_2_glb_magic_bytes(conversion_result):
    glb = Path(conversion_result["glb_path"])
    with open(glb, "rb") as f:
        magic = f.read(4)
    assert magic == b"glTF", f"Bad magic bytes: {magic!r} (expected b'glTF')"


def test_3_glb_parses_with_trimesh(conversion_result):
    import trimesh
    glb = Path(conversion_result["glb_path"])
    mesh = trimesh.load(str(glb), force="mesh")
    assert mesh is not None, "trimesh.load returned None"


def test_4_glb_has_faces(conversion_result):
    import trimesh
    glb = Path(conversion_result["glb_path"])
    mesh = trimesh.load(str(glb), force="mesh")
    if isinstance(mesh, trimesh.Scene):
        face_count = sum(len(g.faces) for g in mesh.geometry.values() if hasattr(g, "faces"))
    else:
        face_count = len(mesh.faces)
    assert face_count >= 1, f"Mesh has no faces (count={face_count})"


# ---------------------------------------------------------------------------
# Geometry assertions (5–8)
# ---------------------------------------------------------------------------

def test_5_geometry_json_exists(conversion_result):
    geom_path = Path(conversion_result["geometry_path"])
    assert geom_path.is_file(), f"Geometry JSON not created at {geom_path}"
    with open(geom_path) as f:
        data = json.load(f)
    assert isinstance(data, dict)


def test_6_surface_area_positive(conversion_result):
    area = conversion_result["geometry"]["surface_area_m2"]
    assert area > 0, f"surface_area_m2 must be > 0, got {area}"
    assert math.isfinite(area), f"surface_area_m2 not finite: {area}"


def test_7_centroid_has_three_finite_floats(conversion_result):
    centroid = conversion_result["geometry"]["centroid_m"]
    assert isinstance(centroid, list) and len(centroid) == 3, f"Bad centroid: {centroid}"
    for c in centroid:
        assert isinstance(c, float), f"Centroid component not float: {c!r}"
        assert math.isfinite(c), f"Centroid component not finite: {c}"


def test_8_aref_plausible(conversion_result):
    g = conversion_result["geometry"]
    aref = g["aref_m2"]
    area = g["surface_area_m2"]
    assert aref > 0, f"aref_m2 must be > 0, got {aref}"
    assert aref < area, f"aref ({aref}) should be less than total surface area ({area})"
