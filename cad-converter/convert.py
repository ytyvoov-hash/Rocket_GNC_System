"""
cad-converter — CLI entry point.

Converts a SolidWorks (.SLDPRT) or STEP (.STEP/.STP) file to GLB,
then extracts a geometry report (surface area, volume, CG, inertia, Aref).

Usage:
    python convert.py <input> [--out-dir DIR] [--rocket-id ID] [--scale FLOAT]

Conversion strategy (tried in order):
    Path A — FreeCAD Python API (if importable in this interpreter)
    Path B — FreeCAD CLI subprocess (freecad_export.py)
    Path C — SLDPRT → STEP via FreeCAD → GLB via trimesh

If the input is already a STEP file, Path A/B are skipped and we go straight
to trimesh-based export (works without FreeCAD on the host).
"""

from __future__ import annotations

import argparse
import logging
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional

# Local imports
sys.path.insert(0, str(Path(__file__).parent))
from geometry import write_geometry_report  # noqa: E402

logging.basicConfig(level=logging.INFO, format="[cad-converter] %(message)s")
log = logging.getLogger("cad-converter")


# ---------------------------------------------------------------------------
# FreeCAD discovery
# ---------------------------------------------------------------------------

def _find_freecad_cli() -> Optional[str]:
    """Locate the FreeCAD CLI executable on the host."""
    for name in ("FreeCADCmd", "freecadcmd", "FreeCAD", "freecad"):
        path = shutil.which(name)
        if path:
            return path
    # Common Windows install locations
    candidates = [
        r"C:\Program Files\FreeCAD 1.0\bin\FreeCADCmd.exe",
        r"C:\Program Files\FreeCAD 0.21\bin\FreeCADCmd.exe",
        r"C:\Program Files\FreeCAD 0.20\bin\FreeCADCmd.exe",
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    return None


def _try_freecad_python_api() -> bool:
    """Check if FreeCAD is importable from the current Python interpreter."""
    try:
        import FreeCAD  # noqa: F401
        return True
    except ImportError:
        return False


# ---------------------------------------------------------------------------
# Conversion paths
# ---------------------------------------------------------------------------

def _path_a_freecad_api(input_path: Path, output_glb: Path) -> bool:
    """Path A — direct FreeCAD Python API (only if FreeCAD is importable)."""
    if not _try_freecad_python_api():
        return False
    try:
        log.info("Path A: using FreeCAD Python API directly")
        import FreeCAD  # type: ignore
        import Mesh     # type: ignore

        doc = FreeCAD.openDocument(str(input_path))
        objects = [o for o in doc.Objects if hasattr(o, "Shape") and o.Shape]
        if not objects:
            log.warning("Path A: no shapes in document")
            return False
        Mesh.export(objects, str(output_glb))
        return output_glb.exists() and output_glb.stat().st_size > 0
    except Exception as e:
        log.warning(f"Path A failed: {e}")
        return False


def _path_b_freecad_cli(input_path: Path, output_glb: Path) -> bool:
    """Path B — FreeCAD CLI subprocess."""
    freecad = _find_freecad_cli()
    if not freecad:
        log.info("Path B skipped: FreeCAD CLI not found on host")
        return False
    script = Path(__file__).parent / "freecad_export.py"
    cmd = [freecad, "--console", "--run-python", str(script), str(input_path), str(output_glb)]
    log.info(f"Path B: {' '.join(cmd)}")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        log.info(f"Path B stdout: {result.stdout.strip()}")
        if result.returncode != 0:
            log.warning(f"Path B failed (rc={result.returncode}): {result.stderr.strip()}")
            return False
        return output_glb.exists() and output_glb.stat().st_size > 0
    except Exception as e:
        log.warning(f"Path B exception: {e}")
        return False


def _path_c_step_intermediate(input_path: Path, output_glb: Path) -> bool:
    """
    Path C — SLDPRT → STEP via FreeCAD → GLB via trimesh.

    Only useful if the input is SLDPRT and FreeCAD is available to export STEP.
    If the input is already STEP, we skip the SLDPRT step.
    """
    import trimesh

    ext = input_path.suffix.lower()
    if ext in (".step", ".stp"):
        log.info("Path C (trimesh-only): loading STEP directly")
        try:
            mesh = trimesh.load(str(input_path), force="mesh")
            mesh.export(str(output_glb))
            return output_glb.exists() and output_glb.stat().st_size > 0
        except Exception as e:
            log.warning(f"Path C STEP→GLB via trimesh failed: {e}")
            return False

    # SLDPRT → STEP via FreeCAD CLI, then STEP → GLB via trimesh
    freecad = _find_freecad_cli()
    if not freecad:
        log.warning("Path C requires FreeCAD CLI to export STEP from SLDPRT")
        return False
    with tempfile.TemporaryDirectory() as td:
        step_path = Path(td) / (input_path.stem + ".step")
        script = Path(__file__).parent / "freecad_export.py"
        cmd = [freecad, "--console", "--run-python", str(script), str(input_path), str(step_path)]
        log.info(f"Path C step-1 (SLDPRT→STEP): {' '.join(cmd)}")
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            if r.returncode != 0 or not step_path.exists():
                log.warning(f"Path C STEP export failed: {r.stderr.strip()}")
                return False
        except Exception as e:
            log.warning(f"Path C STEP export exception: {e}")
            return False
        try:
            mesh = trimesh.load(str(step_path), force="mesh")
            mesh.export(str(output_glb))
            return output_glb.exists() and output_glb.stat().st_size > 0
        except Exception as e:
            log.warning(f"Path C STEP→GLB via trimesh failed: {e}")
            return False


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def convert(
    input_path: str | Path,
    out_dir: str | Path = "output",
    rocket_id: Optional[str] = None,
    scale: float = 1.0,
) -> dict:
    """
    Run the full conversion pipeline.

    Returns a dict with keys:
        glb_path, geometry_path, geometry, path_used
    """
    input_path = Path(input_path).resolve()
    if not input_path.is_file():
        raise FileNotFoundError(f"Input not found: {input_path}")

    out_dir = Path(out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    rid = rocket_id or input_path.stem
    glb_path = out_dir / f"{rid}.glb"
    geom_path = out_dir / f"{rid}_geometry.json"

    log.info(f"Converting {input_path.name} → {glb_path.name}")

    # If input is SLDPRT but a STEP sidecar exists next to it, prefer the STEP
    # (no FreeCAD required, trimesh handles STEP directly).
    if input_path.suffix.lower() == ".sldprt":
        for sidecar_ext in (".step", ".stp", ".STEP", ".STP"):
            sidecar = input_path.with_suffix(sidecar_ext)
            if sidecar.is_file():
                log.info(f"Found STEP sidecar: {sidecar.name} — using it instead of SLDPRT")
                input_path = sidecar
                break

    # Try paths in order
    path_used = None
    for name, fn in (("A", _path_a_freecad_api), ("B", _path_b_freecad_cli), ("C", _path_c_step_intermediate)):
        if fn(input_path, glb_path):
            path_used = name
            break

    if path_used is None:
        raise RuntimeError(
            "All conversion paths failed. Ensure FreeCAD is installed and on PATH "
            "(https://www.freecad.org/downloads.php), or supply a STEP file instead "
            "of SLDPRT (export from SolidWorks: File → Save As → STEP)."
        )

    log.info(f"Conversion succeeded via Path {path_used}")

    # Optionally scale mesh (e.g. mm → m). Re-export GLB at requested scale.
    if scale != 1.0:
        import trimesh
        log.info(f"Applying scale factor {scale}")
        m = trimesh.load(str(glb_path), force="mesh")
        m.apply_scale(scale)
        m.export(str(glb_path))

    # Extract geometry report
    log.info(f"Extracting geometry → {geom_path.name}")
    report = write_geometry_report(glb_path, geom_path)

    return {
        "glb_path": str(glb_path),
        "geometry_path": str(geom_path),
        "geometry": report,
        "path_used": path_used,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert SLDPRT/STEP → GLB and extract geometry.")
    parser.add_argument("input", help="Input CAD file (.sldprt, .step, .stp)")
    parser.add_argument("--out-dir", default="output", help="Output directory (default: ./output)")
    parser.add_argument("--rocket-id", default=None, help="Override output filename stem")
    parser.add_argument("--scale", type=float, default=1.0, help="Scale factor (e.g. 0.001 for mm→m)")
    args = parser.parse_args()

    try:
        result = convert(args.input, args.out_dir, args.rocket_id, args.scale)
    except Exception as e:
        log.error(f"Conversion failed: {e}")
        return 1

    print("\n=== Conversion Result ===")
    print(f"  GLB:        {result['glb_path']}")
    print(f"  Geometry:   {result['geometry_path']}")
    print(f"  Path used:  {result['path_used']}")
    g = result["geometry"]
    print(f"  Area:       {g['surface_area_m2']:.6f} m²")
    print(f"  Volume:     {g['volume_m3']:.6f} m³")
    print(f"  Length:     {g['length_m']:.6f} m")
    print(f"  Aref:       {g['aref_m2']:.6f} m²")
    print(f"  Centroid:   {g['centroid_m']}")
    print(f"  Watertight: {g['is_watertight']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
