#!/usr/bin/env python3
"""Generate preloads/manifest.json from *.js files in the preloads directory.

Reads metadata from comment annotations at the top of each .js file:
    // name: Display Name
    // description: A description of the pattern

If no '// name:' is found, derives a name from the filename.
"""

import json
import os
import re
import sys


def parse_metadata(filepath):
    """Extract name and description from top-of-file comments in a JS file."""
    name = None
    desc = None
    try:
        with open(filepath, "r") as f:
            for line in f:
                stripped = line.strip()
                if not stripped:
                    continue
                name_match = re.match(r"^\s*//\s*name:\s*(.+)", line)
                desc_match = re.match(r"^\s*//\s*description:\s*(.+)", line)
                if name_match:
                    name = name_match.group(1).strip()
                elif desc_match:
                    desc = desc_match.group(1).strip()
                # Stop at the first non-comment, non-empty line
                if not stripped.startswith("//") and not stripped.startswith("/*"):
                    break
    except Exception as e:
        print(f"Warning: could not read {filepath}: {e}", file=sys.stderr)
    return name, desc


def filename_to_name(fname):
    """Derive a display name from filename: 'hello-world.js' → 'Hello World'."""
    base = os.path.splitext(fname)[0]
    return " ".join(word.capitalize() for word in base.replace("-", " ").split())


def generate_manifest(preloads_dir):
    """Scan *.js files and return a list of manifest entries."""
    entries = []
    for fname in sorted(os.listdir(preloads_dir)):
        if not fname.endswith(".js"):
            continue
        filepath = os.path.join(preloads_dir, fname)
        parsed_name, desc = parse_metadata(filepath)
        name = parsed_name or filename_to_name(fname)
        entry = {"name": name, "file": fname}
        if desc:
            entry["description"] = desc
        entries.append(entry)
    return entries


def main():
    preloads_dir = sys.argv[1] if len(sys.argv) > 1 else "preloads"
    manifest = generate_manifest(preloads_dir)
    manifest_path = os.path.join(preloads_dir, "manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    print(f"Generated {manifest_path} with {len(manifest)} entries")


if __name__ == "__main__":
    main()