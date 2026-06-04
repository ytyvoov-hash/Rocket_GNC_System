"""
Geometry extraction for converted CAD meshes.

Produces a JSON-serialisable report with:
  - surface_area_m2     total wetted surface area
  - volume_m3           closed-mesh volume (0 if mesh is not watertight)
  - centroid_m          mesh centroid [x, y, z] (CG estimate)
  - inertia_tensor      3x3 inertia tensor (unit density; scale by material density)
  - aref_m2             maximum cross-section area perpendicular to longest axis
  - bounding_box_m      bounding box extents [x, y, z]
  - length_m            longest bounding-box dimension
  - is_watertight       bool flag for downstream consumers

All units assume the source mesh is in metres. If the SolidWorks part is in
millimetres, scale at convert.py CLI level via --scale 0.001.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import trimesh


def _safe_float(x: Any) -> float:
    """Convert numpy / python numerics to a JSON-safe float."""
    f = float(x)
    if math.isnan(f) or math.isinf(f):
        return 0.0
    return f


def _max_cross_section_area(mesh: trimesh.Trimesh, n_slices: int = 80) -> float:
    """
    Approximate Aref: slice the mesh perpendicular to its longest principal axis
    and return the largest cross-section area found.

    Strategy: collect intersection points per slice, drop the long axis,
    and take the 2D convex-hull area. This is robust to non-watertight meshes
    where closed-loop sectioning fails.
    """
    if mesh.is_empty:
        return 0.0

    extents = mesh.bounding_box.extents
    axis_idx = int(np.argmax(extents))
    axis = np.zeros(3)
    axis[axis_idx] = 1.0

    bounds = mesh.bounds
    lo = bounds[0][axis_idx]
    hi = bounds[1][axis_idx]
    if hi <= lo:
        return 0.0

    # Indices of the two transverse axes for 2D projection
    other = [i for i in range(3) if i != axis_idx]

    try:
        from scipy.spatial import ConvexHull
        have_scipy = True
    except ImportError:
        have_scipy = False

    max_area = 0.0
    for t in np.linspace(lo + 1e-6, hi - 1e-6, n_slices):
        try:
            section = mesh.section(plane_origin=axis * t, plane_normal=axis)
            if section is None:
                continue

            # Try Path3D vertex extraction (works for both closed and open paths)
            pts3d = np.asarray(section.vertices) if hasattr(section, "vertices") else None
            if pts3d is None or len(pts3d) < 3:
                continue

            pts2d = pts3d[:, other]
            if have_scipy and len(pts2d) >= 3:
                try:
                    hull = ConvexHull(pts2d)
                    area = float(hull.volume)  # in 2D, .volume == enclosed area
                except Exception:
                    area = 0.0
            else:
                # Fallback: bounding-rectangle area
                mins = pts2d.min(axis=0)
                maxs = pts2d.max(axis=0)
                area = float((maxs[0] - mins[0]) * (maxs[1] - mins[1]))

            if area > max_area:
                max_area = area
        except Exception:
            # Slicing can fail on non-watertight or weird geometry; skip silently.
            continue
    return max_area


def extract_geometry(mesh_path: str | Path) -> dict[str, Any]:
    """
    Load a mesh file (GLB, STL, OBJ, PLY...) and return a geometry report dict.
    """
    mesh_path = Path(mesh_path)
    loaded = trimesh.load(str(mesh_path), force="mesh")

    # trimesh.load may return a Scene; flatten to a single mesh.
    if isinstance(loaded, trimesh.Scene):
        if len(loaded.geometry) == 0:
            raise ValueError(f"No geometry found in {mesh_path}")
        mesh = trimesh.util.concatenate(
            [g for g in loaded.geometry.values() if isinstance(g, trimesh.Trimesh)]
        )
    else:
        mesh = loaded

    if not isinstance(mesh, trimesh.Trimesh):
        raise TypeError(f"Loaded object is not a Trimesh: {type(mesh)}")

    extents = mesh.bounding_box.extents
    centroid = mesh.centroid
    inertia = mesh.moment_inertia  # unit density

    volume = _safe_float(mesh.volume) if mesh.is_watertight else 0.0
    aref = _max_cross_section_area(mesh)

    return {
        "surface_area_m2": _safe_float(mesh.area),
        "volume_m3": volume,
        "centroid_m": [_safe_float(c) for c in centroid],
        "inertia_tensor": [[_safe_float(v) for v in row] for row in inertia],
        "aref_m2": _safe_float(aref),
        "bounding_box_m": [_safe_float(e) for e in extents],
        "length_m": _safe_float(max(extents)),
        "is_watertight": bool(mesh.is_watertight),
        "face_count": int(len(mesh.faces)),
        "vertex_count": int(len(mesh.vertices)),
    }


def write_geometry_report(mesh_path: str | Path, output_json_path: str | Path) -> dict[str, Any]:
    """Convenience: extract geometry and write JSON to disk; returns the dict."""
    report = extract_geometry(mesh_path)
    output_json_path = Path(output_json_path)
    output_json_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    return report
