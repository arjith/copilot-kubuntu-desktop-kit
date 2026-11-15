# Contributing

Start with a reproducible user task, not a larger collection of prompts.
Explain the host/client versions, expected outcome and smallest safe fix.
Do not imply endorsement by GitHub, KDE or the upstream desktop backend.

## Checks

```bash
uv sync --locked --group dev --python 3.12
uv run python -m unittest discover -s tests
uv run ruff check .
uv run ruff format --check .
shellcheck scripts/desktop-mcp.sh
copilot --plugin-dir "$PWD" plugin list
copilot --plugin-dir "$PWD" skill list
```

Tests must use synthetic state and must not control the developer's desktop.
Describe any separately approved live test without uploading private content.

Keep installer changes per-user, opt-in and reversible. Add a regression for
failure cleanup and preservation of existing files. Backend upgrades must pin
the release and all hashes, preserve the license, and pass readiness plus a
controlled target-app check. Never add a floating download or auto-approved
permission.

Report private-data or unintended-action defects privately using GitHub's
security reporting where available. Do not put credentials, private logs,
screen contents or exploit details in a public issue.
