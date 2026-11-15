import contextlib
import hashlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "desktop_backend", ROOT / "scripts/desktop_backend.py"
)
backend = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(backend)


class BackendTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "data" / "kit" / "v1.2.3"
        self.contents = {name: ("test executable " + name).encode() for name in backend.NAMES}
        self.lock = {
            "repository": "agent-sh/computer-use-linux",
            "tag": "v1.2.3",
            "target": "x86_64-unknown-linux-gnu",
            "artifacts": [
                {"name": name, "sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}
                for name, data in sorted(self.contents.items())
            ],
        }

    def downloader(self, url, destination, artifact):
        self.assertTrue(url.startswith("https://github.com/agent-sh/computer-use-linux/"))
        destination.write_bytes(self.contents[artifact["name"]])
        destination.chmod(0o700)

    def install(self):
        with (
            patch.object(backend.os, "geteuid", return_value=1000),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            backend.install(self.root, self.lock, apply=True, downloader=self.downloader)

    def test_default_install_is_a_plan_without_writes_or_downloads(self):
        def forbidden(*args):
            self.fail("A plan must not download files")

        with contextlib.redirect_stdout(io.StringIO()):
            backend.install(self.root, self.lock, downloader=forbidden)
        self.assertFalse(self.root.parent.exists())

    def test_install_verifies_and_is_idempotent(self):
        self.install()
        backend.verify_install(self.root, self.lock)
        marker = json.loads((self.root / backend.MARKER).read_text())
        self.assertEqual(marker, backend.expected_manifest(self.lock))
        self.assertEqual(
            (self.root / backend.LICENSE_FILE).read_bytes(),
            backend.LICENSE_SOURCE.read_bytes(),
        )
        with contextlib.redirect_stdout(io.StringIO()):
            backend.install(
                self.root,
                self.lock,
                apply=True,
                downloader=lambda *args: self.fail("A valid install should be reused"),
            )

    def test_bad_download_does_not_create_an_installation(self):
        def bad_download(url, destination, artifact):
            destination.write_bytes(b"corrupted")

        with patch.object(backend.os, "geteuid", return_value=1000):
            with self.assertRaises(backend.SetupError):
                backend.install(self.root, self.lock, apply=True, downloader=bad_download)
        self.assertFalse(self.root.exists())

    def test_existing_unknown_directory_is_preserved(self):
        self.root.mkdir(parents=True)
        note = self.root / "my-file"
        note.write_text("preserve")
        with self.assertRaises(backend.SetupError):
            backend.install(self.root, self.lock, apply=True, downloader=self.downloader)
        self.assertEqual(note.read_text(), "preserve")

    def test_modified_binary_is_not_removed(self):
        self.install()
        path = self.root / "computer-use-linux"
        path.write_bytes(b"user modification")
        with self.assertRaises(backend.SetupError):
            backend.uninstall(self.root, self.lock, apply=True)
        self.assertTrue(path.exists())

    def test_unknown_extra_file_prevents_removal(self):
        self.install()
        note = self.root / "personal"
        note.write_text("preserve")
        with self.assertRaises(backend.SetupError):
            backend.uninstall(self.root, self.lock, apply=True)
        self.assertTrue((self.root / "computer-use-linux").exists())

    def test_public_installation_permissions_are_refused(self):
        self.install()
        self.root.chmod(0o755)
        with self.assertRaises(backend.SetupError):
            backend.verify_install(self.root, self.lock)

    def test_uninstall_only_removes_the_owned_installation(self):
        self.install()
        unrelated = self.root.parent / "unrelated"
        unrelated.write_text("preserve")
        with contextlib.redirect_stdout(io.StringIO()):
            backend.uninstall(self.root, self.lock)
        self.assertTrue(self.root.exists())
        with contextlib.redirect_stdout(io.StringIO()):
            backend.uninstall(self.root, self.lock, apply=True)
        self.assertFalse(self.root.exists())
        self.assertEqual(unrelated.read_text(), "preserve")

    def test_symlinked_managed_root_is_refused(self):
        base = Path(self.temporary.name)
        data = base / "data-home"
        data.mkdir()
        (data / "copilot-kubuntu-desktop-kit").symlink_to(base / "elsewhere")
        with self.assertRaises(backend.SetupError):
            backend.managed_root(self.lock, data)

    def test_symlinked_data_ancestor_is_refused(self):
        base = Path(self.temporary.name)
        actual = base / "actual"
        actual.mkdir()
        linked = base / "linked"
        linked.symlink_to(actual)
        with self.assertRaises(backend.SetupError):
            backend.managed_root(self.lock, linked / "nested")

    def test_partial_file_install_failure_cleans_only_new_files(self):
        original_link = backend.os.link
        calls = 0

        def fail_second(source, destination):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError("synthetic link failure")
            return original_link(source, destination)

        with (
            patch.object(backend.os, "geteuid", return_value=1000),
            patch.object(backend.os, "link", side_effect=fail_second),
        ):
            with self.assertRaises(OSError):
                backend.install(self.root, self.lock, apply=True, downloader=self.downloader)
        self.assertFalse(self.root.exists())

    def test_doctor_does_not_echo_private_diagnostic_fields(self):
        self.install()
        raw = {
            "platform": {"home": "private-user-data"},
            "capabilities": {
                "input": ["portal", "private-user-data"],
                "window_control": ["kwin"],
                "private_field": "private-user-data",
            },
            "readiness": {
                **dict.fromkeys(backend.REQUIRED_READINESS, True),
                "private_field": True,
                "warnings": ["private-user-data"],
            },
        }
        output = io.StringIO()
        result = backend.subprocess.CompletedProcess([], 0, stdout=json.dumps(raw), stderr="")
        with (
            patch.object(backend, "desktop_env", return_value={}),
            patch.object(backend.subprocess, "run", return_value=result),
            contextlib.redirect_stdout(output),
        ):
            self.assertEqual(backend.doctor(self.root, self.lock), 0)
        self.assertNotIn("private-user-data", output.getvalue())
        self.assertNotIn("private_field", output.getvalue())
        self.assertFalse(json.loads(output.getvalue())["screen_capture_verified"])

    def test_incomplete_readiness_is_not_reported_as_success(self):
        self.install()
        raw = {
            "capabilities": {},
            "readiness": dict.fromkeys(backend.REQUIRED_READINESS, False),
        }
        result = backend.subprocess.CompletedProcess([], 0, stdout=json.dumps(raw), stderr="")
        with (
            patch.object(backend, "desktop_env", return_value={}),
            patch.object(backend.subprocess, "run", return_value=result),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            self.assertEqual(backend.doctor(self.root, self.lock), 1)

    def test_desktop_child_does_not_inherit_common_tokens_or_unsafe_modes(self):
        with (
            patch.dict(
                backend.os.environ,
                {
                    "XDG_SESSION_TYPE": "wayland",
                    "GH_TOKEN": "test-not-a-real-token",
                    "COMPUTER_USE_LINUX_ENABLE_SHELL": "1",
                    "COMPUTER_USE_LINUX_FORCE_YDOTOOL_KEYBOARD": "1",
                    "COMPUTER_USE_LINUX_FORCE_XDOTOOL_KEYBOARD": "1",
                    "PIXELFLUX_CU": "test-route",
                },
            ),
            patch.object(backend.platform, "system", return_value="Linux"),
        ):
            env = backend.desktop_env()
        self.assertNotIn("GH_TOKEN", env)
        self.assertEqual(env["COMPUTER_USE_LINUX_ENABLE_SHELL"], "0")
        self.assertEqual(env["COMPUTER_USE_LINUX_FORCE_PORTAL_POINTER"], "1")
        self.assertEqual(env["CU_DISABLE_ABS_POINTER"], "1")
        self.assertEqual(env["COMPUTER_USE_LINUX_PERSIST_REMOTE_DESKTOP"], "0")
        self.assertNotIn("COMPUTER_USE_LINUX_FORCE_YDOTOOL_KEYBOARD", env)
        self.assertNotIn("COMPUTER_USE_LINUX_FORCE_XDOTOOL_KEYBOARD", env)
        self.assertNotIn("PIXELFLUX_CU", env)

    def test_non_wayland_session_is_not_silently_redirected(self):
        with patch.dict(backend.os.environ, {"XDG_SESSION_TYPE": "x11"}):
            with self.assertRaises(backend.SetupError):
                backend.desktop_env()


if __name__ == "__main__":
    unittest.main()
