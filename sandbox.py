# /// script
# requires-python = ">=3.9"
# dependencies = ["typer", "rich"]
# ///

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

app = typer.Typer(add_completion=False, no_args_is_help=True)
template_app = typer.Typer(no_args_is_help=True)
app.add_typer(template_app, name="template", help="Manage custom UI templates.")

console = Console()

SCRIPT_DIR = Path(__file__).parent
SANDBOX_DIR = SCRIPT_DIR / "sandbox"
PROJECT = "sandbox"
CHAINSTATE_VOLUME = f"{PROJECT}_yaci_chainstate"
SEED_MARKER = SANDBOX_DIR / ".chainstate-seeded"

CUSTOM_TEMPLATES_DIR = SANDBOX_DIR / "custom-ui-templates"
ADDITIONAL_TEMPLATES_JSON = CUSTOM_TEMPLATES_DIR / "additional-templates.json"

SERVICES = [
    ("uverify-sandbox-ui", "UVerify UI"),
    ("uverify-sandbox-backend", "UVerify Backend"),
    ("uverify-sandbox-yaci-viewer", "Chain viewer"),
    ("uverify-sandbox-yaci-store", "Yaci Store"),
    ("uverify-sandbox-postgres", "PostgreSQL"),
    ("bloxbean-yano", "Yano devnet"),
]

URLS = [
    ("UVerify UI", "http://localhost:3000"),
    ("UVerify Backend", "http://localhost:9090"),
    ("API docs (Swagger)", "http://localhost:9090/swagger-ui/index.html"),
    ("Chain viewer", "http://localhost:3001"),
    ("Yaci Store API", "http://localhost:8080"),
    ("Yaci Store (Swagger)", "http://localhost:8080/swagger-ui/index.html"),
    ("Yano devnet API", "http://localhost:7070/q/swagger-ui"),
]


# ── Template helpers ──────────────────────────────────────────────────────────


def to_camel_case(name: str) -> str:
    parts = name.replace("-", "_").split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def load_templates() -> list[dict]:
    if not ADDITIONAL_TEMPLATES_JSON.exists():
        return []
    try:
        data = json.loads(ADDITIONAL_TEMPLATES_JSON.read_text())
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def save_templates(entries: list[dict]) -> None:
    ADDITIONAL_TEMPLATES_JSON.write_text(json.dumps(entries, indent=2) + "\n")


# ── Docker helpers ────────────────────────────────────────────────────────────


def compose(*args: str, check: bool = True) -> None:
    result = subprocess.run(["docker", "compose", *args], cwd=SANDBOX_DIR)
    if check and result.returncode != 0:
        raise typer.Exit(code=result.returncode)


def chainstate_populated() -> bool:
    if not SEED_MARKER.exists():
        return False
    result = subprocess.run(
        ["docker", "volume", "inspect", CHAINSTATE_VOLUME],
        capture_output=True,
    )
    return result.returncode == 0


def seed_chainstate() -> None:
    console.print("  Seeding chainstate from snapshot...", end="")
    result = subprocess.run(
        [
            "docker", "run", "--rm",
            "-v", f"{CHAINSTATE_VOLUME}:/chainstate",
            "uverify/sandbox-node:latest",
            "sh", "-c", "cp -a /app/snapshots/uverify-base-state/checkpoint/. /chainstate/",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        console.print()
        console.print(f"[red]  Failed to seed chainstate:[/red]\n{result.stderr.strip()}")
        raise typer.Exit(code=1)
    SEED_MARKER.touch()
    console.print(" done.")


def wait_for_yano() -> None:
    console.print("  Waiting for block producer", end="")
    for _ in range(90):
        try:
            urllib.request.urlopen("http://localhost:7070/q/health/ready", timeout=2)
            console.print(" ready.")
            return
        except Exception:
            console.print(".", end="")
            time.sleep(2)
    console.print()
    console.print("[red]  Timed out waiting for yano.[/red]", file=sys.stderr)
    raise typer.Exit(code=1)


def catch_up() -> None:
    console.print("  Advancing chain to wall-clock time...", end="")
    req = urllib.request.Request(
        "http://localhost:7070/api/v1/devnet/epochs/catch-up",
        method="POST",
        data=b"{}",
        headers={"Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        pass
    console.print(" done.")


def print_status() -> None:
    table = Table(show_header=True, header_style="bold")
    table.add_column("Service", style="cyan", min_width=26)
    table.add_column("Status")

    for container, name in SERVICES:
        result = subprocess.run(
            ["docker", "inspect", "--format", "{{.State.Status}}", container],
            capture_output=True,
            text=True,
        )
        raw = result.stdout.strip() if result.returncode == 0 else ""
        label = {
            "running": "[green]running[/green]",
            "exited": "[yellow]stopped[/yellow]",
            "": "[dim]not found[/dim]",
        }.get(raw, raw)
        table.add_row(name, label)

    console.print()
    console.print(table)


def print_urls() -> None:
    table = Table(show_header=True, header_style="bold")
    table.add_column("Service", style="cyan", min_width=26)
    table.add_column("URL", style="blue")

    for name, url in URLS:
        table.add_row(name, url)

    console.print(table)
    console.print()


def do_start(clean: bool = False) -> None:
    if clean:
        console.print("Cleaning sandbox data...")
        compose("down", "-v")
        subprocess.run(["docker", "volume", "rm", CHAINSTATE_VOLUME], capture_output=True)
        SEED_MARKER.unlink(missing_ok=True)
        console.print()

    if not chainstate_populated():
        seed_chainstate()

    if not ADDITIONAL_TEMPLATES_JSON.exists():
        CUSTOM_TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
        save_templates([])

    console.print("Starting UVerify sandbox...")
    compose("up", "-d", "--remove-orphans", check=False)
    console.print()
    wait_for_yano()
    catch_up()
    console.print()
    print_urls()
    console.print("  All services are starting. Some may take up to a minute to become fully ready.")
    console.print("  Run [bold]uv run sandbox.py info[/bold] at any time to check status.\n")


# ── Commands ──────────────────────────────────────────────────────────────────


@app.command()
def start(
    clean: bool = typer.Option(False, "--clean", help="Wipe all data and start fresh from the snapshot"),
) -> None:
    """Start all sandbox services."""
    do_start(clean=clean)


@app.command()
def stop() -> None:
    """Stop all sandbox services."""
    console.print("Stopping UVerify sandbox...")
    compose("down")
    console.print("Done.")


@app.command()
def restart() -> None:
    """Restart all sandbox services."""
    console.print("Restarting UVerify sandbox...")
    compose("down")
    console.print()
    do_start()


@app.command()
def info() -> None:
    """Show service status and URLs."""
    print_status()
    print_urls()


@app.command()
def templates() -> None:
    """List all custom UI templates."""
    entries = load_templates()
    if not entries:
        console.print("[dim]No custom templates configured.[/dim]")
        console.print("Use [bold]uv run sandbox.py template add <name>[/bold] to add one.")
        return
    table = Table(show_header=True, header_style="bold")
    table.add_column("Name", style="cyan")
    table.add_column("Path")
    for entry in entries:
        table.add_row(entry.get("name", ""), entry.get("path", ""))
    console.print()
    console.print(table)
    console.print()


@template_app.command("add")
def template_add(
    name: str = typer.Argument(..., help="Template class name (PascalCase, e.g. MyTemplate)"),
) -> None:
    """Scaffold a new custom UI template and register it."""
    template_dir = CUSTOM_TEMPLATES_DIR / name
    if template_dir.exists():
        console.print(f"[red]Template '{name}' already exists.[/red]")
        raise typer.Exit(code=1)

    npx = shutil.which("npx")
    if not npx:
        console.print("[red]npx not found — install Node.js first.[/red]")
        raise typer.Exit(code=1)

    before = {p.name for p in CUSTOM_TEMPLATES_DIR.iterdir() if p.is_dir()}

    console.print(f"Scaffolding template [bold]{name}[/bold]...")
    result = subprocess.run([npx, "@uverify/cli", "init", name], cwd=CUSTOM_TEMPLATES_DIR)
    if result.returncode != 0:
        raise typer.Exit(code=result.returncode)

    after = {p.name for p in CUSTOM_TEMPLATES_DIR.iterdir() if p.is_dir()}
    new_dirs = after - before
    if not new_dirs:
        console.print("[red]CLI did not create a template folder.[/red]")
        raise typer.Exit(code=1)

    template_dir = CUSTOM_TEMPLATES_DIR / next(iter(new_dirs))

    tsx_files = list(template_dir.rglob("*.tsx"))
    if not tsx_files:
        console.print(f"[red]No .tsx file found in {template_dir}[/red]")
        raise typer.Exit(code=1)

    folder_name = template_dir.name
    camel_name = to_camel_case(folder_name)
    preferred = [template_dir / "src" / "Certificate.tsx", template_dir / "src" / f"{folder_name}.tsx"]
    main_tsx: Path = next((f for f in preferred if f.exists()), tsx_files[0])

    # Use absolute container path — the folder is mounted at /app/custom-templates
    container_path = "/app/custom-templates/" + main_tsx.relative_to(CUSTOM_TEMPLATES_DIR).as_posix()

    entries = load_templates()
    entries.append({"type": "file", "name": camel_name, "path": container_path})
    save_templates(entries)

    console.print(f"[green]Template '{camel_name}' added (folder: {folder_name}).[/green]")
    console.print(
        f"  [dim]Note: template files are at "
        f"sandbox/custom-ui-templates/{folder_name}[/dim]"
    )
    console.print("Run [bold]uv run sandbox.py restart[/bold] to apply.")


@template_app.command("rm")
def template_rm(
    name: str = typer.Argument(..., help="Template name to remove"),
) -> None:
    """Remove a custom UI template."""
    entries = load_templates()
    if not any(e["name"] == name for e in entries):
        console.print(f"[red]Template '{name}' not found.[/red]")
        raise typer.Exit(code=1)

    typer.confirm(f"Remove template '{name}'? This will delete its source folder.", abort=True)

    entry = next(e for e in entries if e["name"] == name)
    container_path = entry.get("path", "")
    # Derive the local folder from the container path (/app/custom-templates/<folder>/...)
    rel = container_path.removeprefix("/app/custom-templates/")
    folder_name = rel.split("/")[0] if rel else name
    template_dir = CUSTOM_TEMPLATES_DIR / folder_name
    if template_dir.exists():
        shutil.rmtree(template_dir)

    save_templates([e for e in entries if e["name"] != name])

    console.print(f"[green]Template '{name}' removed.[/green]")
    console.print("Run [bold]uv run sandbox.py restart[/bold] to apply.")


if __name__ == "__main__":
    app()
