# Copilot Kubuntu Desktop Kit

[![Checks](https://github.com/arjith/copilot-kubuntu-desktop-kit/actions/workflows/check.yml/badge.svg)](https://github.com/arjith/copilot-kubuntu-desktop-kit/actions/workflows/check.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Use Copilot CLI with desktop apps on **KDE Wayland**. The first exercise is
small: operate KCalc, calculate **19 x 23**, and verify **437** in the window.

This is an unofficial integration of
[computer-use-linux](https://github.com/agent-sh/computer-use-linux), not a new
desktop-control engine. It adds a Copilot agent, pinned backend setup and
removal, and six skills for KDE, Python and GPU work.

Backend setup is per-user and opt-in. No root access, global Copilot profile
replacement or automatic permission approval. Screenshots and app text can
still enter model context; local stdio does not make the workflow offline.

## Try the first task

You need your own working Copilot CLI, **Python 3.12+**, KDE Wayland on Linux
x86_64, and KCalc. The initial tested Copilot version is **1.0.112**.
Other host configurations are not yet verified.

Review the tagged source, then inspect the backend installation plan:

```bash
git clone --branch v0.1.0 --depth 1 https://github.com/arjith/copilot-kubuntu-desktop-kit.git
cd copilot-kubuntu-desktop-kit
python3 scripts/desktop_backend.py install
```

If you accept that plan, install the pinned backend, check readiness and load
the plugin:

```bash
python3 scripts/desktop_backend.py install --apply
python3 scripts/desktop_backend.py doctor
copilot --plugin-dir "$PWD" skill list
copilot --plugin-dir "$PWD"
```

Open KCalc yourself. Choose
`/agent copilot-kubuntu-desktop-kit:desktop-operator` and use the
[calculator prompt](examples/README.md#calculator-first-success).
Approve any portal dialog yourself. Success means **437 is visible in KCalc**,
not just that the assistant returned the right answer.

[Report your result](https://github.com/arjith/copilot-kubuntu-desktop-kit/issues/new?template=compatibility.yml).
One sanitized pass/fail report is more useful than a full desktop screenshot.
This is an experimental preview; [SPEC.md](SPEC.md) records the verified scope.

## What else is included

| Agent | Role |
|---|---|
| `workstation-doctor` | Focused Kubuntu diagnostics and safe configuration |
| `python-engineer` | Project-local Python/uv development |
| `cuda-engineer` | Correct, bounded GPU work |
| `desktop-operator` | Explicitly requested GUI tasks with portal handoff |

Skills cover Kubuntu, KDE, Python/uv, NVIDIA/CUDA, Copilot diagnostics and
Linux computer use. Copilot-specific agents and rules live under
`com.github.copilot/`; compatible hosts can reuse the portable `skills/`.

## Enable desktop control deliberately

The plugin does **not** download binaries, change permissions or start a
desktop server during installation. The desktop agent starts its own local
MCP (`kubuntu-desktop`) only when selected. It does not replace an existing
globally configured `computer-use-linux` server.

The explicit backend install above downloads three SHA-256-pinned Linux x86_64 binaries from the upstream
GitHub release into the standard per-user data directory. No root access,
`uinput` permission changes, firewall rules or persistent network listener
are required.

Run Copilot from the logged-in Wayland session. Select `desktop-operator` and
describe the app, outcome and limits—for example:

> Inspect the Calculator window and calculate 19 × 23. Do not operate other apps.

KDE may ask you to select a screen and approve remote control. **Approve it
yourself.** A readiness report does not prove that capture or input is allowed.
Never ask the agent to enter a password, MFA code or approve its own permissions.

For a persistent plugin installation, the tested CLI also accepts
`copilot plugin install arjith/copilot-kubuntu-desktop-kit`, but warns that
direct repository installs are deprecated. Restart Copilot after installing.
[Marketplace review](https://github.com/github/awesome-copilot/issues/6437)
is pending; the plugin is **not yet listed** there.

## What is—and is not—promised

- Exact app targeting and fresh observations are required before actions.
- The optional shell tool and direct input-device route are disabled.
- Common cloud-token environment variables are removed from the desktop child.
- Screenshots may still contain unrelated windows or notifications; they are
  **not automatically password-redacted**.
- Native apps can expose incomplete accessibility trees. Physical user input
  and concurrent agents can invalidate focus; do not run competing controllers.
- The pinned backend initially targets KDE Wayland on Linux x86_64. Other
  architectures and compositor/client combinations are not claimed tested.
- Agent prompts reduce mistakes; they are not an authorization system.

Remote desktop is a separate concern. Shared-desktop RDP, scaling and cursor
behavior need their own verification; installing this plugin does not fix them.

## Remove or update

From the retained checkout above, remove only this kit's verified backend
installation **before** uninstalling the plugin:

```bash
python3 scripts/desktop_backend.py uninstall
python3 scripts/desktop_backend.py uninstall --apply
copilot plugin uninstall copilot-kubuntu-desktop-kit
```

The last command applies only if you installed the plugin persistently.
For `--plugin-dir`, restart Copilot without that flag.

Removal refuses modified binaries, symlinks and unknown files. It never
deletes personal Copilot settings or another backend installation.
Updates require an intentional version/hash change and a new verification run;
there is no floating `latest` download.

## Develop and verify

```bash
uv sync --group dev --python 3.12
uv run python -m unittest discover -s tests
uv run ruff check .
uv run ruff format --check .
shellcheck scripts/desktop-mcp.sh
```

Tests use synthetic temporary directories and do not control the live desktop.
See [NOTICE.md](NOTICE.md) for upstream attribution and licensing.
For contributions, see [CONTRIBUTING.md](CONTRIBUTING.md). The
[launch plan](docs/LAUNCH.md) prioritizes verified users over star counts.
If the kit is useful, a star helps you find it again when updates land.
