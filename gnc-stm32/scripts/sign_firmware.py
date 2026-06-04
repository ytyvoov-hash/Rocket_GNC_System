#!/usr/bin/env python3
"""v8 P5.1 + INV-6 — firmware signing hook for Path B.

Computes the SHA-256 of a linked firmware image (the same digest the on-target
``gnc::stm32::FirmwareSignature`` recomputes at boot) and records it in
``release_manifest.yaml`` under ``path_b.firmware_sha256`` so a flight build can
refuse to run an unsigned or tampered image.

This is intentionally a hash-attestation hook; wiring an asymmetric signature
(e.g. ed25519 over the digest with ``signing_key_id``) is a drop-in extension
once a key-management story exists.

Usage:
    sign_firmware.py <firmware.bin> [--manifest release_manifest.yaml] [--key-id KID]
    sign_firmware.py <firmware.bin> --print     # just print the digest
"""
import argparse
import hashlib
import re
import sys
from pathlib import Path


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def update_manifest(manifest: Path, digest: str, key_id: str) -> None:
    """Set path_b.firmware_sha256 / signing_key_id in-place (line-oriented; no
    YAML dependency so the hook runs in a bare CI image)."""
    text = manifest.read_text()
    if "path_b:" not in text:
        raise SystemExit(f"{manifest}: no 'path_b:' section to update")

    def replace_in_block(block_name: str, field: str, value: str, s: str) -> str:
        # Replace 'field: <anything>' on the first line after '<block_name>:'.
        pattern = re.compile(
            rf"(^{block_name}:\n(?:[ \t]+.*\n)*?[ \t]+{field}:)[ \t]*.*$",
            re.MULTILINE,
        )
        repl = rf'\1 "{value}"'
        new_s, n = pattern.subn(repl, s)
        if n == 0:
            raise SystemExit(f"{manifest}: could not find {block_name}.{field}")
        return new_s

    text = replace_in_block("path_b", "firmware_sha256", digest, text)
    text = replace_in_block("path_b", "signing_key_id", key_id, text)
    manifest.write_text(text)


def main() -> int:
    ap = argparse.ArgumentParser(description="Sign a Path B firmware image.")
    ap.add_argument("firmware", type=Path)
    ap.add_argument("--manifest", type=Path, default=None)
    ap.add_argument("--key-id", default="dev-unsigned")
    ap.add_argument("--print", action="store_true", dest="print_only")
    args = ap.parse_args()

    if not args.firmware.is_file():
        raise SystemExit(f"firmware not found: {args.firmware}")

    digest = sha256_file(args.firmware)
    print(f"sha256({args.firmware.name}) = {digest}")

    if args.print_only:
        return 0
    if args.manifest:
        update_manifest(args.manifest, digest, args.key_id)
        print(f"updated {args.manifest}: path_b.firmware_sha256, signing_key_id={args.key_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
