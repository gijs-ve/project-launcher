import os
import shlex
import subprocess
import sys
from pathlib import Path


def _resolve_editor(project_config: dict) -> str:
    if project_config.get("editor"):
        return project_config["editor"]
    env_editor = os.environ.get("EDITOR")
    if env_editor:
        return env_editor
    return "code"


def launch_project(project_config: dict) -> None:
    path = project_config["path"]
    if not Path(path).exists():
        raise FileNotFoundError(f"Project path does not exist: {path}")
    editor = _resolve_editor(project_config)
    subprocess.Popen([editor, path])


def open_terminal(project_config: dict) -> None:
    path = project_config["path"]
    if not Path(path).exists():
        raise FileNotFoundError(f"Project path does not exist: {path}")

    if sys.platform == "darwin":
        subprocess.Popen(["open", "-a", "Terminal", path])
    elif sys.platform.startswith("linux"):
        terminals = [
            ("gnome-terminal", ["--working-directory", path]),
            ("konsole", ["--workdir", path]),
            ("xfce4-terminal", ["--working-directory", path]),
            ("xterm", ["-e", f"cd {shlex.quote(path)} && $SHELL"]),
        ]
        for term, args in terminals:
            try:
                subprocess.Popen([term] + args)
                return
            except FileNotFoundError:
                continue
        raise RuntimeError("No supported terminal emulator found.")
    elif sys.platform == "win32":
        subprocess.Popen(["cmd.exe"], cwd=path)
    else:
        raise RuntimeError(f"Unsupported platform: {sys.platform}")
