#!/usr/bin/env python3
"""Validate release_manifest.yaml (v5.4 §0.3.3, clause C-RM).

Fails (non-zero exit) if:
  * the file is not valid YAML;
  * committed_rockets is missing or empty;
  * any committed rocket is missing one of its four required artefacts
    (golden, tolerances, scenarios, onboarding_report);
  * a referenced artefact path does not exist on disk.

Used by CI (manifest-schema gate) and runnable locally:
    python3 scripts/validate_release_manifest.py [path-to-manifest]
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover
    print("ERROR: PyYAML is required (pip install pyyaml)", file=sys.stderr)
    sys.exit(2)

REQUIRED_ARTEFACTS = {"golden", "tolerances", "scenarios", "onboarding_report"}


def main(argv: list[str]) -> int:
    manifest_path = Path(argv[1]) if len(argv) > 1 else Path("release_manifest.yaml")
    repo_root = manifest_path.resolve().parent

    if not manifest_path.exists():
        print(f"ERROR: {manifest_path} not found", file=sys.stderr)
        return 1

    try:
        data = yaml.safe_load(manifest_path.read_text())
    except yaml.YAMLError as exc:
        print(f"ERROR: {manifest_path} is not valid YAML:\n{exc}", file=sys.stderr)
        return 1

    if not isinstance(data, dict):
        print("ERROR: manifest top level must be a mapping", file=sys.stderr)
        return 1

    rockets = data.get("committed_rockets")
    if not isinstance(rockets, list) or not rockets:
        print("ERROR: committed_rockets must be a non-empty list", file=sys.stderr)
        return 1

    errors: list[str] = []
    for i, rocket in enumerate(rockets):
        if not isinstance(rocket, dict):
            errors.append(f"committed_rockets[{i}] must be a mapping")
            continue
        rid = rocket.get("id", f"<index {i}>")
        artefacts = rocket.get("required_artefacts")
        if not isinstance(artefacts, dict):
            errors.append(f"{rid}: required_artefacts must be a mapping")
            continue
        missing = REQUIRED_ARTEFACTS - set(artefacts)
        if missing:
            errors.append(f"{rid}: missing required artefacts {sorted(missing)}")
        for name, rel in artefacts.items():
            if name not in REQUIRED_ARTEFACTS:
                continue
            if not isinstance(rel, str) or not rel:
                errors.append(f"{rid}: artefact '{name}' has no path")
                continue
            if not (repo_root / rel).exists():
                errors.append(f"{rid}: artefact '{name}' path does not exist: {rel}")

    if errors:
        print("release_manifest.yaml INVALID:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    ids = [r.get("id") for r in rockets]
    print(f"release_manifest.yaml VALID; committed rockets: {ids}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
