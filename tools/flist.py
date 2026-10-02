"""Select local web assets and generate flist.json."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import tkinter as tk
from tkinter import messagebox
from easygui import enterbox, boolbox

ROOT = Path(__file__).resolve().parent
HASH_ALGORITHMS = ("MD5", "SHA1", "SHA224", "SHA256", "SHA384", "SHA512")
DEFAULT_HASH_ALGORITHM = "SHA256"
EXTENSIONS = {
    ".html",
    ".css",
    ".js",
    ".json",
    ".map",
    ".mp3",
    ".wav",
    ".ogg",
    ".m4a",
    ".aac",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".svg",
    ".ico",
    ".mp4",
    ".webm",
    ".mov",
    ".mkv",
}
EXCLUDED_PARTS = {".git", "__pycache__"}
EXCLUDED_DIRS = {"lang", ".github", "github"}


def source_url(path: Path) -> str:
    return "/" + path.relative_to(ROOT).as_posix()


def file_hash(path: Path, algorithm: str) -> str:
    digest = hashlib.new(algorithm.casefold())
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def choose_hash_algorithm() -> str:
    selected = enterbox(
        "Hash algorithm (MD5, SHA1, SHA224, SHA256, SHA384, or SHA512)",
        "Generate flist",
        DEFAULT_HASH_ALGORITHM,
    )
    algorithm = (selected or DEFAULT_HASH_ALGORITHM).strip().upper()
    if algorithm not in HASH_ALGORITHMS:
        messagebox.showwarning(
            "Invalid hash algorithm",
            f"Unsupported algorithm: {algorithm}. Using {DEFAULT_HASH_ALGORITHM}.",
        )
        return DEFAULT_HASH_ALGORITHM
    return algorithm


def candidates() -> list[Path]:
    result = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in EXTENSIONS:
            continue
        relative_parts = set(path.relative_to(ROOT).parts)
        if relative_parts & EXCLUDED_PARTS or relative_parts & EXCLUDED_DIRS:
            continue
        if path.name in {"flist.py", "flist.json"}:
            continue
        result.append(path)
    return sorted(result, key=lambda item: source_url(item).lower())


def load_existing_sources() -> list[str]:
    manifest_path = ROOT / "flist.json"
    if not manifest_path.exists():
        return []
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception:
        return []
    files = manifest.get("files") if isinstance(manifest, dict) else None
    if not isinstance(files, list):
        return []

    sources: list[str] = []
    seen: set[str] = set()
    for entry in files:
        if not isinstance(entry, dict):
            continue
        source = entry.get("source", entry.get("url"))
        if not isinstance(source, str) or source in seen:
            continue
        sources.append(source)
        seen.add(source)
    return sources


def order_paths(paths: list[Path], existing_sources: list[str]) -> list[Path]:
    paths_by_source = {source_url(path): path for path in paths}
    selected_paths = [
        paths_by_source[source]
        for source in existing_sources
        if source in paths_by_source
    ]
    existing_set = set(existing_sources)
    remaining_paths = sorted(
        (path for path in paths if source_url(path) not in existing_set),
        key=lambda item: source_url(item).lower(),
    )
    return selected_paths + remaining_paths


def choose_files(labels: list[str], preselect: list[int]) -> list[str] | None:
    root = tk.Tk()
    root.title("Generate flist")
    root.geometry("980x640")
    root.minsize(720, 420)
    root.columnconfigure(0, weight=1)
    root.rowconfigure(0, weight=1)

    outer = tk.Frame(root, padx=12, pady=12)
    outer.grid(row=0, column=0, sticky="nsew")
    outer.columnconfigure(0, weight=1)
    outer.rowconfigure(0, weight=1)

    list_frame = tk.Frame(outer)
    list_frame.grid(row=0, column=0, sticky="nsew")
    list_frame.columnconfigure(0, weight=1)
    list_frame.rowconfigure(0, weight=1)

    listbox = tk.Listbox(
        list_frame,
        selectmode=tk.MULTIPLE,
        exportselection=False,
        activestyle="dotbox",
        height=24,
    )
    scrollbar = tk.Scrollbar(list_frame, orient="vertical", command=listbox.yview)
    listbox.configure(yscrollcommand=scrollbar.set)
    listbox.grid(row=0, column=0, sticky="nsew")
    scrollbar.grid(row=0, column=1, sticky="ns")

    for label in labels:
        listbox.insert(tk.END, label)

    for index in preselect:
        if 0 <= index < len(labels):
            listbox.selection_set(index)
            listbox.activate(index)

    button_row = tk.Frame(outer, pady=10)
    button_row.grid(row=1, column=0, sticky="ew")
    button_row.columnconfigure(0, weight=1)

    tk.Label(
        button_row,
        text="Click files to toggle selection; selected files are highlighted.",
        anchor="w",
    ).grid(row=0, column=0, sticky="w")

    selection_tools = tk.Frame(button_row)
    selection_tools.grid(row=0, column=1, sticky="e")

    def select_all() -> None:
        listbox.selection_set(0, tk.END)

    def clear_selection() -> None:
        listbox.selection_clear(0, tk.END)

    tk.Button(selection_tools, text="Select all", command=select_all).pack(
        side="left", padx=(0, 6)
    )
    tk.Button(selection_tools, text="Clear", command=clear_selection).pack(side="left")

    action_row = tk.Frame(outer)
    action_row.grid(row=2, column=0, sticky="ew")

    result: dict[str, list[str] | None] = {"selected": None}

    def finish() -> None:
        result["selected"] = [listbox.get(index) for index in listbox.curselection()]
        root.destroy()

    def cancel() -> None:
        result["selected"] = None
        root.destroy()

    tk.Button(action_row, text="OK", width=10, command=finish).pack(
        side="right", padx=(8, 0)
    )
    tk.Button(action_row, text="Cancel", width=10, command=cancel).pack(side="right")
    root.protocol("WM_DELETE_WINDOW", cancel)
    root.mainloop()
    return result["selected"]


def main() -> None:
    paths = candidates()
    if not paths:
        messagebox.showinfo("flist", "No supported files were found.")
        return

    existing_sources = load_existing_sources()
    ordered_paths = order_paths(paths, existing_sources)
    choice_map = [(source_url(path), path) for path in ordered_paths]
    labels = [source for source, _path in choice_map]
    existing_set = set(existing_sources)
    preselect = [
        index
        for index, (source, _path) in enumerate(choice_map)
        if source in existing_set
    ]
    selected = choose_files(labels, preselect)
    if selected is None:
        return

    algorithm = choose_hash_algorithm()
    selected_set = set(selected)
    files = []
    required_bytes = 0
    for source, path in choice_map:
        if source not in selected_set:
            continue
        required_bytes += path.stat().st_size
        files.append(
            {
                "source": source,
                "hash": file_hash(path, algorithm),
            }
        )
    try:
        with open(ROOT / "flist.json", "r", encoding="utf-8") as f:
            previous = json.load(f)
    except (OSError, json.JSONDecodeError):
        previous = {}

    previous_this = previous.get("this") if isinstance(previous, dict) else None
    previous_this = previous_this if isinstance(previous_this, dict) else {}
    try:
        version_id = int(previous_this.get("id", 0)) + 1
    except (TypeError, ValueError):
        version_id = 1
    try:
        last_required_update = int(previous.get("lastRequiredUpdate", 0))
    except (TypeError, ValueError):
        last_required_update = 0
    previous_name = str(previous_this.get("name", ""))

    name = enterbox(f"Name for this version, last is {previous_name}")
    if boolbox("Force update?"):
        last_required_update = version_id
    manifest = {
        "alg": algorithm,
        "this": {"name": name or "", "id": version_id},
        "lastRequiredUpdate": min(last_required_update, version_id),
        "requiredBytes": required_bytes,
        "files": files,
    }
    output = ROOT / "flist.json"
    output.write_text(json.dumps(manifest, indent=4, ensure_ascii=False) + "\n", encoding="utf-8")
    messagebox.showinfo(
        "flist generated",
        f"Generated {len(files)} files\nRequired space: {required_bytes} B\n\n{output}",
    )


if __name__ == "__main__":
    main()
