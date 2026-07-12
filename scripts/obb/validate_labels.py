from __future__ import annotations

import argparse
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate Ultralytics OBB labels")
    parser.add_argument("--dataset", type=Path, required=True); parser.add_argument("--allow-empty", action="store_true")
    args = parser.parse_args(); errors = []; counts = {"train": 0, "val": 0, "test": 0}
    for split in counts:
        image_dir, label_dir = args.dataset / "images" / split, args.dataset / "labels" / split
        for image in image_dir.glob("*"):
            label = label_dir / f"{image.stem}.txt"
            if not label.is_file(): errors.append(f"missing label: {label}"); continue
            lines = [line.strip() for line in label.read_text(encoding="utf-8").splitlines() if line.strip()]
            if not lines and not args.allow_empty: errors.append(f"unreviewed/empty label: {label}")
            for line_number, line in enumerate(lines, 1):
                parts = line.split()
                if len(parts) != 9: errors.append(f"{label}:{line_number}: expected class + 8 coordinates"); continue
                try: class_id, coords = int(parts[0]), [float(value) for value in parts[1:]]
                except ValueError: errors.append(f"{label}:{line_number}: non-numeric value"); continue
                if class_id != 0: errors.append(f"{label}:{line_number}: only class 0 is allowed")
                if any(value < 0 or value > 1 for value in coords): errors.append(f"{label}:{line_number}: coordinates outside [0,1]")
                counts[split] += 1
    if counts["val"] == 0 or counts["test"] == 0: errors.append("val and test must contain real labeled error marks")
    if errors:
        print("\n".join(errors[:100])); raise SystemExit(f"Label validation failed with {len(errors)} error(s)")
    print(f"OBB labels valid: {counts}")


if __name__ == "__main__":
    main()
