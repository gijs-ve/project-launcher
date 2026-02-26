from typing import Optional
import json
import os
from pathlib import Path


def _config_path() -> Path:
    custom = os.environ.get("PROJECT_LAUNCHER_CONFIG")
    if custom:
        return Path(custom)
    return Path.home() / ".project-launcher" / "config.json"


class Config:
    def __init__(self):
        self._path = _config_path()
        self._data: dict = {"projects": {}}

    def load(self) -> None:
        if self._path.exists():
            with open(self._path) as f:
                self._data = json.load(f)
        else:
            self._data = {"projects": {}}

    def save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with open(self._path, "w") as f:
            json.dump(self._data, f, indent=2)

    def add_project(self, name: str, path: str, editor: Optional[str] = None) -> None:
        entry = {"path": path}
        if editor:
            entry["editor"] = editor
        self._data["projects"][name] = entry

    def remove_project(self, name: str) -> None:
        if name not in self._data["projects"]:
            raise KeyError(f"Project '{name}' not found.")
        del self._data["projects"][name]

    def get_project(self, name: str) -> dict:
        if name not in self._data["projects"]:
            raise KeyError(f"Project '{name}' not found.")
        return self._data["projects"][name]

    def list_projects(self) -> dict:
        return dict(self._data["projects"])
