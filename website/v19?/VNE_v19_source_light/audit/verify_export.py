#!/usr/bin/env python3
"""Verify the unmodified exported source snapshot, using only the Python standard library."""
from pathlib import Path
import hashlib
import json
import sys

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / "audit/MANIFEST.json").read_text())
source = (root / "source").resolve()
errors = []
for entry in manifest["files"]:
    path = (source / entry["path"]).resolve()
    if not path.is_relative_to(source) or not path.is_file():
        errors.append("Missing or unsafe: " + entry["path"])
        continue
    data = path.read_bytes()
    if len(data) != entry["bytes"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
        errors.append("Changed: " + entry["path"])
if errors:
    print("FAILED\n" + "\n".join(errors))
    sys.exit(1)
print(f"PASS: {manifest['included_files']} source files match VNE version 19 ({manifest['source_commit']}).")
