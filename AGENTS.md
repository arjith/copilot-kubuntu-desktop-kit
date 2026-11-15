# Repository guidance

This repository packages Copilot guidance and an opt-in local desktop backend.
It must not import a user's personal Copilot configuration or change a live
desktop while being developed or tested.

- Keep installers dependency-free, explicit, reversible, and per-user.
- Never weaken TLS, portal consent, authentication, or tool approvals.
- Do not ship account names, machine addresses, logs, keys, desktop screenshots,
  tokens, compiled executables, or session state. Website raster illustrations
  need an authored SVG source and an explicit publication-check allowlist entry.
- Use the documented Agent Plugins 1.0 layout. Do not pin agent models.
- Keep the backend version and hashes in `backend.lock.json`.
- Run `uv run python -m unittest discover -s tests`, Ruff, and ShellCheck.
- Test installer changes using a temporary data directory and stub downloads.
- Update compatibility notes when changing runtime or host requirements.
