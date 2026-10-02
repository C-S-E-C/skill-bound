"""Normalize text files and repair hash entries in flist.json."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Iterator


ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "flist.json"
CHUNK_SIZE = 1024 * 1024
EXCLUDED_PARTS = {".git", ".github", "github", "__pycache__"}


def is_excluded(path: Path) -> bool:
    """Return whether a path belongs to Git/GitHub or generated cache files."""
    parts = {part.casefold() for part in path.relative_to(ROOT).parts}
    return bool(parts & {part.casefold() for part in EXCLUDED_PARTS})


def iter_files() -> Iterator[Path]:
    for path in ROOT.rglob("*"):
        if path.is_file() and not is_excluded(path):
            yield path


def normalize_text(path: Path) -> bool:
    """Convert a UTF-8 text file's line endings to LF, skipping binary files."""
    data = path.read_bytes()
    if b"\x00" in data:
        return False
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return False

    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    if normalized == text:
        return False
    path.write_text(normalized, encoding="utf-8", newline="\n")
    return True


def normalize_files() -> int:
    changed = 0
    for path in iter_files():
        if normalize_text(path):
            changed += 1
            print(f"LF: {path.relative_to(ROOT).as_posix()}")
    return changed


def resolve_manifest_path(raw: Any) -> Path | None:
    if not isinstance(raw, str) or not raw.strip():
        return None
    value = raw.strip()
    path = Path(value)
    if path.is_absolute():
        return path
    return ROOT / value.lstrip("/").replace("/", "\\")


HASH_ALGORITHMS = {"MD5", "SHA1", "SHA224", "SHA256", "SHA384", "SHA512"}


def file_hash(path: Path, algorithm: str) -> str:
    digest = hashlib.new(algorithm.casefold())
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(CHUNK_SIZE), b""):
            digest.update(chunk)
    return digest.hexdigest()


def repair_manifest() -> tuple[int, int]:
    try:
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Cannot read {MANIFEST}: {error}") from error

    if not isinstance(manifest, dict) or not isinstance(manifest.get("files"), list):
        raise RuntimeError(f"Invalid manifest format: {MANIFEST}")

    algorithm = str(manifest.get("alg", "MD5")).upper()
    if algorithm not in HASH_ALGORITHMS:
        raise RuntimeError(f"Unsupported manifest hash algorithm: {algorithm}")
    manifest["alg"] = algorithm

    version = manifest.get("this")
    if not isinstance(version, dict):
        raise RuntimeError(f"Invalid version metadata in {MANIFEST}: missing this")
    try:
        version_id = int(version.get("id", 0))
        required_update = int(manifest.get("lastRequiredUpdate", 0))
    except (TypeError, ValueError) as error:
        raise RuntimeError(f"Invalid version metadata in {MANIFEST}: ids must be integers") from error
    if version_id < 0 or required_update < 0 or required_update > version_id:
        raise RuntimeError(
            f"Invalid version metadata in {MANIFEST}: "
            "lastRequiredUpdate must be between 0 and this.id"
        )
    version["id"] = version_id
    manifest["lastRequiredUpdate"] = required_update

    kept: list[dict[str, Any]] = []
    removed = 0
    repaired = 0
    required_bytes = 0

    for entry in manifest["files"]:
        if not isinstance(entry, dict):
            removed += 1
            continue
        source = entry.get("source")
        path = resolve_manifest_path(source)
        if path is None or not path.is_file():
            label = source or "<unknown>"
            print(f"REMOVE: {label} (file not found)")
            removed += 1
            continue

        actual = file_hash(path, algorithm)
        if entry.get("hash") != actual:
            old = entry.get("hash", "<missing>")
            entry.pop("url", None)
            entry.pop("md5", None)
            entry["source"] = source
            entry["hash"] = actual
            repaired += 1
            print(f"{algorithm}: {path.relative_to(ROOT).as_posix()} {old} -> {actual}")
        required_bytes += path.stat().st_size
        kept.append(entry)

    manifest["files"] = kept
    manifest["requiredBytes"] = required_bytes
    MANIFEST.write_text(
        json.dumps(manifest, indent=4, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return repaired, removed


def main() -> int:
    changed = normalize_files()
    repaired, removed = repair_manifest()
    print(f"Changed {changed} text file(s) to LF.")
    print(f"Repaired {repaired} hash entr{'y' if repaired == 1 else 'ies'}.")
    print(f"Removed {removed} missing entr{'y' if removed == 1 else 'ies'}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
