import pytest
from click.testing import CliRunner

from project_launcher.cli import main


@pytest.fixture
def runner(tmp_path, monkeypatch):
    cfg_path = tmp_path / "config.json"
    monkeypatch.setenv("PROJECT_LAUNCHER_CONFIG", str(cfg_path))
    return CliRunner()


@pytest.fixture
def project_dir(tmp_path):
    d = tmp_path / "myapp"
    d.mkdir()
    return d


def test_add_project(runner, project_dir):
    result = runner.invoke(main, ["add", "myapp", str(project_dir)])
    assert result.exit_code == 0
    assert "Added project 'myapp'" in result.output


def test_add_project_with_editor(runner, project_dir):
    result = runner.invoke(main, ["add", "myapp", str(project_dir), "--editor", "vim"])
    assert result.exit_code == 0
    assert "Added project 'myapp'" in result.output


def test_list_empty(runner):
    result = runner.invoke(main, ["list"])
    assert result.exit_code == 0
    assert "No projects registered" in result.output


def test_list_with_project(runner, project_dir):
    runner.invoke(main, ["add", "myapp", str(project_dir)])
    result = runner.invoke(main, ["list"])
    assert result.exit_code == 0
    assert "myapp" in result.output
    assert str(project_dir) in result.output


def test_remove_project(runner, project_dir):
    runner.invoke(main, ["add", "myapp", str(project_dir)])
    result = runner.invoke(main, ["remove", "myapp"])
    assert result.exit_code == 0
    assert "Removed project 'myapp'" in result.output


def test_remove_nonexistent(runner):
    result = runner.invoke(main, ["remove", "ghost"])
    assert result.exit_code != 0
    assert "not found" in result.output


def test_launch_nonexistent_project(runner):
    result = runner.invoke(main, ["launch", "ghost"])
    assert result.exit_code != 0
    assert "not found" in result.output


def test_launch_missing_path(runner, tmp_path, monkeypatch):
    cfg_path = tmp_path / "config.json"
    monkeypatch.setenv("PROJECT_LAUNCHER_CONFIG", str(cfg_path))

    # Add project pointing to a path that doesn't exist
    missing = tmp_path / "missing"
    add_result = runner.invoke(main, ["add", "broken", str(missing)])
    assert add_result.exit_code == 0

    result = runner.invoke(main, ["launch", "broken"])
    assert result.exit_code != 0
    assert "does not exist" in result.output


def test_open_nonexistent_project(runner):
    result = runner.invoke(main, ["open", "ghost"])
    assert result.exit_code != 0
    assert "not found" in result.output


def test_launch_calls_subprocess(runner, project_dir, monkeypatch):
    called = {}

    def fake_popen(cmd):
        called["cmd"] = cmd
        return object()

    import project_launcher.launcher as launcher_mod
    monkeypatch.setattr(launcher_mod.subprocess, "Popen", fake_popen)
    monkeypatch.setenv("EDITOR", "nano")

    runner.invoke(main, ["add", "myapp", str(project_dir)])
    result = runner.invoke(main, ["launch", "myapp"])
    assert result.exit_code == 0
    assert called["cmd"][0] == "nano"
    assert called["cmd"][1] == str(project_dir)
