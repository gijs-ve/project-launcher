import json
import pytest

from project_launcher.config import Config


@pytest.fixture
def config_file(tmp_path, monkeypatch):
    cfg_path = tmp_path / "config.json"
    monkeypatch.setenv("PROJECT_LAUNCHER_CONFIG", str(cfg_path))
    return cfg_path


def test_load_empty(config_file):
    cfg = Config()
    cfg.load()
    assert cfg.list_projects() == {}


def test_add_and_get_project(config_file, tmp_path):
    project_dir = tmp_path / "myproject"
    project_dir.mkdir()

    cfg = Config()
    cfg.load()
    cfg.add_project("myproject", str(project_dir))
    assert cfg.get_project("myproject")["path"] == str(project_dir)


def test_add_project_with_editor(config_file, tmp_path):
    project_dir = tmp_path / "proj"
    project_dir.mkdir()

    cfg = Config()
    cfg.load()
    cfg.add_project("proj", str(project_dir), editor="vim")
    assert cfg.get_project("proj")["editor"] == "vim"


def test_save_and_reload(config_file, tmp_path):
    project_dir = tmp_path / "savedproject"
    project_dir.mkdir()

    cfg = Config()
    cfg.load()
    cfg.add_project("savedproject", str(project_dir))
    cfg.save()

    cfg2 = Config()
    cfg2.load()
    assert cfg2.get_project("savedproject")["path"] == str(project_dir)


def test_remove_project(config_file, tmp_path):
    project_dir = tmp_path / "toremove"
    project_dir.mkdir()

    cfg = Config()
    cfg.load()
    cfg.add_project("toremove", str(project_dir))
    cfg.remove_project("toremove")
    assert "toremove" not in cfg.list_projects()


def test_remove_nonexistent_raises(config_file):
    cfg = Config()
    cfg.load()
    with pytest.raises(KeyError, match="not found"):
        cfg.remove_project("ghost")


def test_get_nonexistent_raises(config_file):
    cfg = Config()
    cfg.load()
    with pytest.raises(KeyError, match="not found"):
        cfg.get_project("ghost")


def test_list_projects(config_file, tmp_path):
    p1 = tmp_path / "p1"
    p2 = tmp_path / "p2"
    p1.mkdir()
    p2.mkdir()

    cfg = Config()
    cfg.load()
    cfg.add_project("p1", str(p1))
    cfg.add_project("p2", str(p2))
    projects = cfg.list_projects()
    assert set(projects.keys()) == {"p1", "p2"}
