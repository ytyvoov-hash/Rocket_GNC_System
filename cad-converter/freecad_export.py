"""
FreeCAD headless export script (Path B in the plan).

Invoked by convert.py as a subprocess:
    FreeCAD --console --run freecad_export.py <input.sldprt|step> <output.glb|step>

Output file extension determines the export format:
  - .glb / .gltf    → mesh export
  - .step / .stp    → STEP export (used by Path C fallback)
"""

import os
import sys

# This file runs inside the FreeCAD Python interpreter, so FreeCAD is on sys.path.
try:
    import FreeCAD  # type: ignore
    import Mesh     # type: ignore
    import Part     # type: ignore
except ImportError as e:
    sys.stderr.write(f"FreeCAD modules unavailable: {e}\n")
    sys.exit(2)


def export_mesh(doc, output_path: str) -> None:
    """Export all visible solids in the document as a single mesh file."""
    shapes = []
    for obj in doc.Objects:
        if hasattr(obj, "Shape") and obj.Shape is not None:
            shapes.append(obj.Shape)
    if not shapes:
        sys.stderr.write("No shapes found in document\n")
        sys.exit(3)

    # Tessellate each shape and combine.
    meshes = []
    for shape in shapes:
        mesh = Mesh.Mesh()
        # tessellate(deflection): smaller = finer mesh
        triangles = shape.tessellate(0.1)
        verts, faces = triangles
        # Build mesh from triangle list
        tri_list = []
        for face in faces:
            tri_list.append(
                [
                    (verts[face[0]].x, verts[face[0]].y, verts[face[0]].z),
                    (verts[face[1]].x, verts[face[1]].y, verts[face[1]].z),
                    (verts[face[2]].x, verts[face[2]].y, verts[face[2]].z),
                ]
            )
        if tri_list:
            mesh.addFacets(tri_list)
            meshes.append(mesh)

    if not meshes:
        sys.stderr.write("Tessellation produced no facets\n")
        sys.exit(4)

    combined = Mesh.Mesh()
    for m in meshes:
        combined.addMesh(m)

    Mesh.export([_wrap_mesh(combined)], output_path)


def _wrap_mesh(mesh):
    """Wrap a raw Mesh into a document object so Mesh.export accepts it."""
    doc = FreeCAD.ActiveDocument or FreeCAD.newDocument("export_tmp")
    obj = doc.addObject("Mesh::Feature", "ExportMesh")
    obj.Mesh = mesh
    return obj


def export_step(doc, output_path: str) -> None:
    """Export all shapes as a single STEP file."""
    shapes = []
    for obj in doc.Objects:
        if hasattr(obj, "Shape") and obj.Shape is not None:
            shapes.append(obj.Shape)
    if not shapes:
        sys.stderr.write("No shapes found for STEP export\n")
        sys.exit(3)
    compound = Part.makeCompound(shapes)
    compound.exportStep(output_path)


def main() -> int:
    # FreeCAD passes script args after the script name when using --run.
    argv = sys.argv
    # Strip FreeCAD's own args; everything after the script path is ours.
    if len(argv) < 3:
        sys.stderr.write("Usage: freecad_export.py <input> <output>\n")
        return 1

    input_path = argv[-2]
    output_path = argv[-1]

    if not os.path.isfile(input_path):
        sys.stderr.write(f"Input file not found: {input_path}\n")
        return 1

    doc = FreeCAD.openDocument(input_path)
    ext = os.path.splitext(output_path)[1].lower()

    if ext in (".glb", ".gltf", ".obj", ".stl", ".ply"):
        export_mesh(doc, output_path)
    elif ext in (".step", ".stp"):
        export_step(doc, output_path)
    else:
        sys.stderr.write(f"Unsupported output extension: {ext}\n")
        return 1

    sys.stdout.write(f"Exported: {output_path}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
