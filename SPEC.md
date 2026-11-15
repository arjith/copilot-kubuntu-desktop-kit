# Workstation kit specification

**Version:** 0.1 private pilot. Guidance and opt-in integration, not an
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

Isolated-host checks must confirm namespaced agent selection and lazy MCP
startup without replacing an existing desktop server. A readiness check is
not capture permission. Full capture, focus, interruption, keyboard-layout and
fractional-scaling coverage needs explicit desktop/device testing before
advertising a configuration as supported.

No update, installation or test may overwrite a user's Copilot profile,
credentials, MCP configuration or other backend installation.
