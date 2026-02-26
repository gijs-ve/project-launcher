import click

from .config import Config
from .launcher import launch_project, open_terminal


def _load_config() -> Config:
    cfg = Config()
    cfg.load()
    return cfg


@click.group()
def main():
    """Project Launcher – manage and open your projects quickly."""


@main.command()
@click.argument("name")
@click.argument("path")
@click.option("--editor", default=None, help="Editor command to open this project.")
def add(name, path, editor):
    """Register a project by NAME at PATH."""
    cfg = _load_config()
    cfg.add_project(name, path, editor)
    cfg.save()
    click.echo(f"Added project '{name}' at {path}.")


@main.command()
@click.argument("name")
def remove(name):
    """Remove a registered project by NAME."""
    cfg = _load_config()
    try:
        cfg.remove_project(name)
    except KeyError as e:
        raise click.ClickException(str(e))
    cfg.save()
    click.echo(f"Removed project '{name}'.")


@main.command(name="list")
def list_projects():
    """List all registered projects."""
    cfg = _load_config()
    projects = cfg.list_projects()
    if not projects:
        click.echo("No projects registered.")
        return
    for name, info in projects.items():
        editor = info.get("editor", "(default)")
        click.echo(f"  {name}: {info['path']}  [editor: {editor}]")


@main.command()
@click.argument("name")
def launch(name):
    """Launch project NAME in its configured editor."""
    cfg = _load_config()
    try:
        project = cfg.get_project(name)
    except KeyError as e:
        raise click.ClickException(str(e))
    try:
        launch_project(project)
    except FileNotFoundError as e:
        raise click.ClickException(str(e))
    click.echo(f"Launching '{name}'...")


@main.command(name="open")
@click.argument("name")
def open_project(name):
    """Open a terminal in project NAME's directory."""
    cfg = _load_config()
    try:
        project = cfg.get_project(name)
    except KeyError as e:
        raise click.ClickException(str(e))
    try:
        open_terminal(project)
    except (FileNotFoundError, RuntimeError) as e:
        raise click.ClickException(str(e))
    click.echo(f"Opening terminal for '{name}'...")
