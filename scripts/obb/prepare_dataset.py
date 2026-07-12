from __future__ import annotations

import argparse
import json
import random
import re
import shutil
from collections import defaultdict
from pathlib import Path

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def group_key(path: Path) -> str:
    stem = re.sub(r"[_-]\d+$", "", path.stem)
    return f"{path.parent.name}/{stem}"


def split_groups(images: list[Path], seed: int) -> dict[str, list[Path]]:
    groups: dict[str, list[Path]] = defaultdict(list)
    for image in images:
        groups[group_key(image)].append(image)
    keys = list(groups); random.Random(seed).shuffle(keys)
    keys.sort(key=lambda key: len(groups[key]), reverse=True)
    targets = {"train": 0.72 * len(images), "val": 0.17 * len(images), "test": 0.11 * len(images)}
    output = {"train": [], "val": [], "test": []}
    for key in keys:
        split = min(output, key=lambda name: len(output[name]) / max(1, targets[name]))
        output[split].extend(groups[key])
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare a leakage-safe YOLO OBB dataset skeleton")
    parser.add_argument("--source", type=Path, required=True); parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=42); parser.add_argument("--copy", action="store_true")
    args = parser.parse_args()
    images = sorted(p for p in args.source.rglob("*") if p.suffix.lower() in IMAGE_SUFFIXES)
    if len(images) < 20:
        raise SystemExit(f"Need at least 20 images, found {len(images)}")
    splits = split_groups(images, args.seed); manifest = []
    for split, paths in splits.items():
        image_dir, label_dir = args.output / "images" / split, args.output / "labels" / split
        image_dir.mkdir(parents=True, exist_ok=True); label_dir.mkdir(parents=True, exist_ok=True)
        for index, source in enumerate(paths):
            safe_name = f"{source.parent.name}_{index:04d}_{source.name}"
            destination = image_dir / safe_name
            if destination.exists() or destination.is_symlink(): destination.unlink()
            shutil.copy2(source, destination) if args.copy else destination.symlink_to(source)
            # Empty label files are intentional: replace them during annotation.
            (label_dir / f"{destination.stem}.txt").touch()
            manifest.append({"split": split, "source": str(source), "image": str(destination), "group": group_key(source)})
    root = args.output.resolve()
    (args.output / "data.yaml").write_text(
        f"path: {root}\ntrain: images/train\nval: images/val\ntest: images/test\nnames:\n  0: error_mark\n",
        encoding="utf-8",
    )
    (args.output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print({split: len(items) for split, items in splits.items()})


if __name__ == "__main__":
    main()
