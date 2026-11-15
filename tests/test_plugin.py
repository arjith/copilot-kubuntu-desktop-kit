import json
import re
import subprocess
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


def frontmatter(path):
    text = path.read_text()
    if not text.startswith("---\n"):
        raise AssertionError("Missing frontmatter: " + str(path.relative_to(ROOT)))
    return yaml.safe_load(text.split("---\n", 2)[1])


class PluginTest(unittest.TestCase):
    def test_manifest_uses_portable_components_not_legacy_fields(self):
        data = json.loads((ROOT / "plugin.json").read_text())
        self.assertEqual(
            data["$schema"], "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
        )
        self.assertNotIn("mcpServers", data)
        self.assertNotIn("hooks", data)
        self.assertNotIn("agents", data)

    def test_skills_have_unique_valid_discovery_metadata(self):
        paths = list((ROOT / "skills").glob("*/SKILL.md"))
        self.assertGreaterEqual(len(paths), 6)
        names = []
        for path in paths:
            data = frontmatter(path)
            self.assertRegex(data["name"], r"^[a-z0-9-]+$")
            self.assertEqual(path.parent.name, data["name"])
            self.assertTrue(data["description"])
            names.append(data["name"])
        self.assertEqual(len(names), len(set(names)))

    def test_agents_keep_repository_rules_and_do_not_pin_models(self):
        paths = list((ROOT / "com.github.copilot/agents").glob("*.agent.md"))
        self.assertEqual(len(paths), 4)
        for path in paths:
            data = frontmatter(path)
            self.assertTrue(data["include-custom-instructions"])
            self.assertTrue(data["strict-tools-list"])
            self.assertNotIn("model", data)
            self.assertNotIn("agent", data["tools"])

    def test_desktop_agent_mcp_is_scoped_to_the_plugin_launcher(self):
        data = frontmatter(ROOT / "com.github.copilot/agents/desktop-operator.agent.md")
        server = data["mcp-servers"]["kubuntu-desktop"]
        self.assertEqual(server["command"], "bash")
        self.assertEqual(server["args"], ["${PLUGIN_ROOT}/scripts/desktop-mcp.sh"])
        self.assertNotIn("execute", data["tools"])
        self.assertFalse((ROOT / "mcp.json").exists())

    def test_original_files_do_not_contain_machine_state(self):
        patterns = [
            r"/home/[A-Za-z0-9_.-]+/",
            r"\b192\.168\.\d+\.\d+\b",
            r"ghp_[A-Za-z0-9]+",
            r"\b\d+\+[A-Za-z0-9-]+@users\.noreply\.github\.com\b",
        ]
        names = (
            subprocess.check_output(
                [
                    "git",
                    "-C",
                    str(ROOT),
                    "ls-files",
                    "--cached",
                    "--others",
                    "--exclude-standard",
                    "-z",
                ],
            )
            .decode()
            .split("\0")
        )
        for name in set(filter(None, names)):
            path = ROOT / name
            self.assertTrue(path.is_file() and not path.is_symlink(), name)
            data = path.read_bytes()
            self.assertNotIn(b"\0", data, name)
            text = data.decode()
            for pattern in patterns:
                self.assertIsNone(re.search(pattern, text), path.relative_to(ROOT))


if __name__ == "__main__":
    unittest.main()
