"""
cad-converter — FastAPI REST server.

Wraps convert.py in HTTP. Runs jobs synchronously (conversion is fast enough
for typical rocket parts; for >50MB files, a future queue can be added).

Endpoints:
    GET  /health             liveness check
    POST /convert            multipart upload (file + rocket_id) → result
    GET  /status/{job_id}    poll job state
    GET  /models/{name}      serve a converted GLB (for frontend consumption)
    GET  /geometry/{name}    serve a geometry JSON

Run:
    uvicorn server:app --host 0.0.0.0 --port 5100
"""

from __future__ import annotations

import logging
import os
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from convert import convert

logging.basicConfig(level=logging.INFO, format="[server] %(message)s")
log = logging.getLogger("cad-converter-server")

# Output directory: defaults to ./output (Phase 1/2 local), or /cad inside Docker.
OUTPUT_DIR = Path(os.environ.get("CAD_OUTPUT_DIR", Path(__file__).parent / "output")).resolve()
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTS = {".sldprt", ".step", ".stp"}

app = FastAPI(
    title="cad-converter",
    description="SLDPRT/STEP → GLB + geometry extraction",
    version="0.1.0",
)

# Allow the gnc-frontend dev server (Vite on :5173) to call us during integration.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# In-memory job registry (sufficient until async queue is added).
JOBS: dict[str, dict[str, Any]] = {}


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe."""
    return {"status": "ok", "output_dir": str(OUTPUT_DIR)}


@app.post("/convert")
async def convert_endpoint(
    file: UploadFile = File(...),
    rocket_id: str = Form(...),
) -> JSONResponse:
    """
    Upload a SLDPRT or STEP file. Runs conversion synchronously and returns
    GLB url + extracted geometry.
    """
    # Validate filename and extension
    if not file.filename:
        raise HTTPException(400, "Missing filename")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(400, f"Unsupported file type: {ext}. Allowed: {sorted(ALLOWED_EXTS)}")

    # Sanitize rocket_id to a safe filesystem identifier
    safe_id = "".join(c for c in rocket_id if c.isalnum() or c in ("_", "-")).strip()
    if not safe_id:
        raise HTTPException(400, "rocket_id must contain alphanumeric / _ / - characters")

    job_id = str(uuid.uuid4())
    JOBS[job_id] = {"job_id": job_id, "rocket_id": safe_id, "status": "running"}

    # Save upload to a temp dir
    with tempfile.TemporaryDirectory() as td:
        upload_path = Path(td) / f"{safe_id}{ext}"
        with open(upload_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        log.info("Job %s: saved upload %s (%d bytes)", job_id, upload_path.name, upload_path.stat().st_size)

        try:
            result = convert(upload_path, out_dir=OUTPUT_DIR, rocket_id=safe_id)
        except Exception as e:
            log.exception("Job %s: conversion failed", job_id)
            JOBS[job_id].update(status="error", error=str(e))
            raise HTTPException(500, f"Conversion failed: {e}")

    payload = {
        "job_id": job_id,
        "rocket_id": safe_id,
        "status": "done",
        "path_used": result["path_used"],
        "glb_url": f"/models/{safe_id}.glb",
        "geometry_url": f"/geometry/{safe_id}.json",
        "geometry": result["geometry"],
    }
    JOBS[job_id].update(payload)
    return JSONResponse(payload)


@app.get("/status/{job_id}")
def status(job_id: str) -> dict[str, Any]:
    """Look up an in-memory job record."""
    if job_id not in JOBS:
        raise HTTPException(404, f"Unknown job_id: {job_id}")
    return JOBS[job_id]


@app.get("/models/{name}")
def get_model(name: str) -> FileResponse:
    """Serve a converted GLB file."""
    if not name.endswith(".glb"):
        raise HTTPException(400, "Only .glb files are served from /models")
    path = OUTPUT_DIR / name
    if not path.is_file():
        raise HTTPException(404, f"Not found: {name}")
    return FileResponse(path, media_type="model/gltf-binary", filename=name)


@app.get("/geometry/{name}")
def get_geometry(name: str) -> FileResponse:
    """Serve a geometry JSON file."""
    if not name.endswith(".json"):
        raise HTTPException(400, "Only .json files are served from /geometry")
    path = OUTPUT_DIR / name
    if not path.is_file():
        raise HTTPException(404, f"Not found: {name}")
    return FileResponse(path, media_type="application/json", filename=name)
