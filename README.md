# Copilot Kubuntu Desktop Kit

Focused Copilot workflows for a KDE Wayland workstation, with optional,
permission-based control of local applications.

The kit ships no personal profile, credentials or background daemon.
Desktop control uses the existing **computer-use-linux** project; this
repository packages safer onboarding and environment-specific guidance.

## Start with the plugin

Use a recent Copilot CLI supporting Agent Plugins 1.0. The initial tested host
is **1.0.112** on Kubuntu/KDE Wayland.

```bash
copilot plugin install arjith/copilot-kubuntu-desktop-kit
```

While this repository is private, your signed-in GitHub account needs access.
For a local checkout:

```bash
copilot --plugin-dir "$PWD" skill list
```

Restart Copilot after installation. Choose an agent with `/agent`.
If a personal agent has the same name, choose the plugin-qualified entry,
for example `/agent copilot-kubuntu-desktop-kit:desktop-operator`.

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

Review the backend installation plan:

```bash
git clone https://github.com/arjith/copilot-kubuntu-desktop-kit.git
cd copilot-kubuntu-desktop-kit
python3 scripts/desktop_backend.py install
python3 scripts/desktop_backend.py install --apply
python3 scripts/desktop_backend.py doctor
```

This downloads three SHA-256-pinned Linux x86_64 binaries from the upstream
GitHub release into the standard per-user data directory. No root access,
`uinput` permission changes, firewall rules or persistent network listener
are required.

Run Copilot from the logged-in Wayland session. Select `desktop-operator` and
describe the app, outcome and limits—for example:

> Inspect the Calculator window and calculate 19 × 23. Do not operate other apps.

KDE may ask you to select a screen and approve remote control. **Approve it
yourself.** A readiness report does not prove that capture or input is allowed.
Never ask the agent to enter a password, MFA code or approve its own permissions.

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

The related [iPad RDP kit](https://github.com/arjith/kubuntu-rdp-ipad-kit)
is separate. Shared-desktop RDP, scaling and cursor behavior need their own
verification; installing this plugin does not fix them.

## Remove or update

From the retained checkout above, remove only this kit's verified backend
installation **before** uninstalling the plugin:

```bash
python3 scripts/desktop_backend.py uninstall
python3 scripts/desktop_backend.py uninstall --apply
copilot plugin uninstall copilot-kubuntu-desktop-kit
```

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
