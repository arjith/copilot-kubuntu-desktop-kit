# Attribution and boundaries

This kit's original instructions, agents, installer and tests are MIT licensed.

Desktop control is provided by
[agent-sh/computer-use-linux](https://github.com/agent-sh/computer-use-linux),
an independently maintained MIT-licensed project. Its release binaries are
downloaded only after an explicit install request, pinned by version and SHA-256.
They are not included in this repository. The upstream license is in
`third-party/computer-use-linux.LICENSE`.

The plugin format and host behavior come from GitHub Copilot CLI and the
[Agent Plugins specification](https://agent-plugins.org/).
KDE, Qt, Python, uv and NVIDIA tooling are separate dependencies with their
own licenses. This kit does not imply endorsement by those projects.

The approved `site/assets/kcalc-result.png` capture shows KDE's KCalc application
in a disposable test window. It is an actual app capture, not an illustration
or a claim of KDE endorsement.

This is integration and workflow packaging, not a new desktop automation
engine. It does not replace Wayland permissions or create a security sandbox.
