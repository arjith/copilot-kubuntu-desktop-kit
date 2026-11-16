# Workstation kit specification

**Version:** 0.1 experimental preview. Guidance and opt-in integration, not an
authorization system or a promise of unattended GUI reliability.

| Requirement | Acceptance evidence |
|---|---|
| Standard plugin discovery | Copilot CLI loads six skills, four agents and the documented client layout |
| No setup side effects | Plugin install has no hooks, global MCP, binary download or permission changes |
| Explicit desktop dependency | Backend install/uninstall defaults to a plan; only `--apply` changes owned files |
| Pinned source of executable code | Release tag, architecture, sizes and SHA-256 values are validated |
| Safe failure and rollback | Corrupt/partial downloads, edited binaries, unknown files and symlink paths are refused |
| Least-surprising desktop route | Portal keyboard/pointer, no optional shell/direct input route, no inherited route overrides |
| Private readiness output | Only named boolean readiness fields and known capability routes are reported |
| Human authorization | Credentials, capture/control approval and consequential effects remain direct user steps |
| License preservation | Upstream MIT notice is shipped with installed binaries; no binaries are committed |
| Project conventions | Engineering agents inherit repository instructions and do not pin models or recurse |

Automated acceptance:

```bash
uv sync --locked --group dev --python 3.12
uv run python -m unittest discover -s tests
uv run ruff check .
uv run ruff format --check .
shellcheck scripts/desktop-mcp.sh
copilot --plugin-dir "$PWD" plugin list
copilot --plugin-dir "$PWD" skill list
```

Isolated-host checks confirmed private GitHub installation, six-skill discovery
and namespaced agent selection without changing personal configuration.
The maintainer-run GitHub marketplace route was separately tested in a fresh,
credential-free home: catalog registration, immutable v0.1.0 installation,
enabled-plugin discovery, six skills, four agents, then plugin/catalog removal.
No backend binaries were implicitly installed. A local-directory catalog is
not an equivalent substitute for this test: this CLI build pruned that local
catalog's installed copy during discovery, so the documented route uses GitHub.
On the initial Kubuntu/KDE Wayland host, a user-approved cropped test-window
capture, coordinate click, portal keyboard press/backspace and accessibility
readback also passed. Those results do not imply a broad device matrix.

A readiness check is not capture permission. Interruption, keyboard-layout,
multi-monitor and fractional-scaling coverage still need explicit testing before
advertising additional configurations as supported.

No update, installation or test may overwrite a user's Copilot profile,
credentials, MCP configuration or other backend installation.
