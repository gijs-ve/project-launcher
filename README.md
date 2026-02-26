# project-launcher

A simple Python CLI tool to register, manage, and quickly launch your projects in your preferred editor or a terminal.

## Installation

```bash
pip install -e ".[dev]"
```

## Usage

### Add a project

```bash
project-launcher add myapp /path/to/myapp
project-launcher add myapp /path/to/myapp --editor code
```

### List projects

```bash
project-launcher list
```

### Launch a project in its editor

```bash
project-launcher launch myapp
```

### Open a terminal in a project directory

```bash
project-launcher open myapp
```

### Remove a project

```bash
project-launcher remove myapp
```

## Configuration

Projects are stored in `~/.project-launcher/config.json`. Override the config path with the `PROJECT_LAUNCHER_CONFIG` environment variable.

```json
{
  "projects": {
    "myapp": {
      "path": "/path/to/myapp",
      "editor": "code"
    }
  }
}
```

The editor precedence is: project-specific editor → `$EDITOR` env var → `code` (VS Code).
