#!/usr/bin/env python3
"""Install and launch a checksum-pinned desktop backend without changing host policy."""

import argparse
import hashlib
import json
import os
import platform
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPOSITORY = Path(__file__).resolve().parent.parent
NAMES = {
    "computer-use-linux",
    "computer-use-linux-cosmic",
    "computer-use-linux-indicator",
}
MARKER = "installation.json"
LICENSE_FILE = "LICENSE.computer-use-linux"
LICENSE_SOURCE = REPOSITORY / "third-party/computer-use-linux.LICENSE"
READINESS_FIELDS = {
    "can_register_mcp_tools",
    "can_build_accessibility_tree",
    "can_query_windows",
    "can_focus_apps",
    "can_focus_windows",
    "can_send_development_input",
}
REQUIRED_READINESS = {
    "can_register_mcp_tools",
    "can_build_accessibility_tree",
    "can_query_windows",
    "can_send_development_input",
}
CAPABILITY_FIELDS = {"input", "screenshot", "window_control", "accessibility", "isolation"}
KNOWN_ROUTES = {
    "abs_pointer",
    "portal",
    "kwin",
    "atspi",
    "shared",
    "xdotool",
    "wtype",
    "ydotool",
    "pixelflux",
    "gnome_shell",
    "gnome_extension",
    "gnome_screenshot",
    "x11",
    "hyprland",
    "niri",
    "i3",
    "cosmic",
    "wlr_foreign_toplevel",
    "labwc",
    "wmctrl",
}


class SetupError(Exception):
    """An explicit setup or integrity failure."""


class HTTPSRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urllib.parse.urlsplit(newurl).scheme != "https":
            raise SetupError("Refusing a non-HTTPS release redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def load_lock():
    data = json.loads((REPOSITORY / "backend.lock.json").read_text())
    if not isinstance(data, dict):
        raise SetupError("Invalid backend lock document")
    if data.get("repository") != "agent-sh/computer-use-linux":
        raise SetupError("Unexpected backend publisher")
    if not re.fullmatch(r"v\d+\.\d+\.\d+", data.get("tag", "")):
        raise SetupError("Invalid pinned release")
    if data.get("target") != "x86_64-unknown-linux-gnu":
        raise SetupError("Unsupported backend target")
    artifacts = data.get("artifacts", [])
    if not isinstance(artifacts, list) or any(not isinstance(a, dict) for a in artifacts):
        raise SetupError("Invalid artifact records")
    if {a.get("name") for a in artifacts} != NAMES or len(artifacts) != len(NAMES):
        raise SetupError("Unexpected backend artifact list")
    for artifact in artifacts:
        if not re.fullmatch(r"[0-9a-f]{64}", artifact.get("sha256", "")):
            raise SetupError("Invalid artifact digest")
        if type(artifact.get("size")) is not int or not 0 < artifact["size"] < 32_000_000:
            raise SetupError("Invalid artifact size")
    return data


def managed_root(lock, data_home=None):
    base = Path(data_home or os.environ.get("XDG_DATA_HOME") or Path.home() / ".local/share")
    if not base.is_absolute():
        raise SetupError("The data directory must be absolute")
    root = base / "copilot-kubuntu-desktop-kit" / lock["tag"]
    for path in (root, *root.parents):
        if path.is_symlink():
            raise SetupError("Refusing a symlinked installation directory")
    return root


def digest(path):
    if path.is_symlink() or not path.is_file():
        raise SetupError("Expected a regular managed file: " + path.name)
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def expected_manifest(lock):
    return {
        "tag": lock["tag"],
        "files": {
            **{a["name"]: a["sha256"] for a in lock["artifacts"]},
            LICENSE_FILE: digest(LICENSE_SOURCE),
        },
    }


def verify_install(root, lock):
    if root.is_symlink():
        raise SetupError("Refusing a symlinked installation")
    if not root.is_dir() or root.stat().st_uid != os.getuid() or root.stat().st_mode & 0o077:
        raise SetupError("The managed installation must be private and owned by this user")
    marker = root / MARKER
    if marker.is_symlink() or not marker.is_file():
        raise SetupError("No complete managed installation; refusing to replace unknown files")
    if json.loads(marker.read_text()) != expected_manifest(lock):
        raise SetupError("Installation ownership metadata does not match this release")
    for artifact in lock["artifacts"]:
        if digest(root / artifact["name"]) != artifact["sha256"]:
            raise SetupError("Managed binary was modified: " + artifact["name"])
    if digest(root / LICENSE_FILE) != digest(LICENSE_SOURCE):
        raise SetupError("The installed upstream license was modified")


def asset_url(lock, artifact):
    filename = artifact["name"] + "-" + lock["target"]
    return (
        "https://github.com/"
        + lock["repository"]
        + "/releases/download/"
        + lock["tag"]
        + "/"
        + filename
    )


def download(url, path, artifact):
    opener = urllib.request.build_opener(HTTPSRedirects())
    request = urllib.request.Request(url, headers={"User-Agent": "copilot-kubuntu-desktop-kit"})
    try:
        with opener.open(request, timeout=30) as response, path.open("xb") as output:
            total = 0
            while chunk := response.read(65536):
                total += len(chunk)
                if total > artifact["size"]:
                    raise SetupError("Release artifact exceeds its pinned size")
                output.write(chunk)
    except urllib.error.URLError as error:
        raise SetupError("Release download failed: " + str(error.reason)) from error
    if path.stat().st_size != artifact["size"] or digest(path) != artifact["sha256"]:
        raise SetupError("Release artifact failed size or SHA-256 verification")
    path.chmod(0o700)


def install(root, lock, apply=False, downloader=download):
    if root.exists():
        verify_install(root, lock)
        print("The pinned backend is already installed and verified.")
        return
    if not apply:
        print("Plan only: download and verify three binaries into " + str(root))
        print("No files or desktop settings changed. Add --apply to install.")
        return
    if os.geteuid() == 0:
        raise SetupError("Run this installer as the desktop user, not root")
    if platform.system() != "Linux" or platform.machine() not in {"x86_64", "amd64"}:
        raise SetupError("This pinned build supports Linux x86_64 only")
    root.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.TemporaryDirectory(prefix="backend-stage-", dir=root.parent) as temporary:
        stage = Path(temporary)
        for artifact in lock["artifacts"]:
            downloader(asset_url(lock, artifact), stage / artifact["name"], artifact)
            if digest(stage / artifact["name"]) != artifact["sha256"]:
                raise SetupError("Staged release digest mismatch")
        (stage / LICENSE_FILE).write_bytes(LICENSE_SOURCE.read_bytes())
        (stage / LICENSE_FILE).chmod(0o600)
        (stage / MARKER).write_text(json.dumps(expected_manifest(lock), indent=2) + "\n")
        (stage / MARKER).chmod(0o600)
        root.mkdir(mode=0o700)
        created = []
        complete = False
        try:
            for name in [*(a["name"] for a in lock["artifacts"]), LICENSE_FILE, MARKER]:
                destination = root / name
                os.link(stage / name, destination)
                created.append(destination)
            complete = True
        finally:
            if not complete:
                for path in reversed(created):
                    path.unlink()
                if not any(root.iterdir()):
                    root.rmdir()
        verify_install(root, lock)
    print("Installed the pinned backend. No system policy or Copilot permissions changed.")


def uninstall(root, lock, apply=False):
    verify_install(root, lock)
    allowed = NAMES | {MARKER, LICENSE_FILE}
    if {p.name for p in root.iterdir()} != allowed:
        raise SetupError("Extra files found; refusing to remove this directory")
    if not apply:
        print("Plan only: remove this kit's verified binaries from " + str(root))
        print("No files changed. Add --apply to uninstall.")
        return
    for name in sorted(allowed):
        (root / name).unlink()
    root.rmdir()
    print("Removed this kit's backend only. User configuration and other installs were preserved.")


def desktop_env():
    if platform.system() != "Linux" or os.environ.get("XDG_SESSION_TYPE") != "wayland":
        raise SetupError("Start Copilot from the logged-in Linux Wayland desktop session")
    env = os.environ.copy()
    for key in list(env):
        if key.startswith("COMPUTER_USE_LINUX_") or key in {
            "CU_DISABLE_ABS_POINTER",
            "PIXELFLUX_CU",
        }:
            env.pop(key)
    for key in (
        "GH_TOKEN",
        "GITHUB_TOKEN",
        "COPILOT_GITHUB_TOKEN",
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AZURE_CLIENT_SECRET",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
    ):
        env.pop(key, None)
    env.update(
        {
            "COMPUTER_USE_LINUX_FORCE_PORTAL_POINTER": "1",
            "COMPUTER_USE_LINUX_FORCE_PORTAL_KEYBOARD": "1",
            "CU_DISABLE_ABS_POINTER": "1",
            "COMPUTER_USE_LINUX_ENABLE_SHELL": "0",
            "COMPUTER_USE_LINUX_NOTIFY_ON_COMPLETE": "0",
            "COMPUTER_USE_LINUX_INDICATOR_HIDE_TEXT": "1",
            "COMPUTER_USE_LINUX_AGENT_NAME": "Copilot",
            "COMPUTER_USE_LINUX_PERSIST_REMOTE_DESKTOP": "0",
        }
    )
    return env


def doctor(root, lock):
    report = {
        "backend_tag": lock["tag"],
        "platform": platform.system(),
        "architecture": platform.machine(),
        "session_type": os.environ.get("XDG_SESSION_TYPE", "unknown"),
        "installed": root.exists(),
        "screen_capture_verified": False,
    }
    if not root.exists():
        report["next_step"] = "Run desktop_backend.py install --apply after reviewing the plan"
        print(json.dumps(report, indent=2))
        return 1
    verify_install(root, lock)
    result = subprocess.run(
        [str(root / "computer-use-linux"), "doctor"],
        capture_output=True,
        text=True,
        timeout=30,
        check=True,
        env=desktop_env(),
    )
    data = json.loads(result.stdout)
    if not isinstance(data, dict):
        raise SetupError("Backend returned invalid diagnostics")
    readiness = data.get("readiness")
    if (
        not isinstance(readiness, dict)
        or not REQUIRED_READINESS <= readiness.keys()
        or any(type(readiness[key]) is not bool for key in REQUIRED_READINESS)
    ):
        raise SetupError("Backend returned no structured readiness report")
    capabilities = data.get("capabilities", {})
    if not isinstance(capabilities, dict):
        raise SetupError("Backend returned invalid capability metadata")
    report["capabilities"] = {
        key: [route for route in routes if isinstance(route, str) and route in KNOWN_ROUTES]
        for key, routes in capabilities.items()
        if key in CAPABILITY_FIELDS and isinstance(routes, list)
    }
    report["readiness"] = {
        key: readiness[key]
        for key in sorted(READINESS_FIELDS)
        if key in readiness and type(readiness[key]) is bool
    }
    report["notice"] = "This checks readiness only. Screen sharing and input require user consent."
    print(json.dumps(report, indent=2))
    return 0 if all(readiness[key] for key in REQUIRED_READINESS) else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["install", "uninstall", "doctor", "serve"])
    parser.add_argument(
        "--apply", action="store_true", help="Apply install or uninstall explicitly"
    )
    parser.add_argument("--data-home", type=Path, help="Absolute per-user data directory")
    args = parser.parse_args()
    if args.apply and args.action not in {"install", "uninstall"}:
        parser.error("--apply is only valid for install or uninstall")
    lock = load_lock()
    root = managed_root(lock, args.data_home)
    if args.action == "install":
        install(root, lock, args.apply)
    elif args.action == "uninstall":
        uninstall(root, lock, args.apply)
    elif args.action == "doctor":
        return doctor(root, lock)
    else:
        verify_install(root, lock)
        binary = str(root / "computer-use-linux")
        env = desktop_env()
        env["COMPUTER_USE_LINUX_COSMIC_HELPER"] = str(root / "computer-use-linux-cosmic")
        env["COMPUTER_USE_LINUX_INDICATOR_BIN"] = str(root / "computer-use-linux-indicator")
        os.execve(binary, [binary, "mcp"], env)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (
        SetupError,
        OSError,
        ValueError,
        subprocess.CalledProcessError,
        subprocess.TimeoutExpired,
    ) as error:
        print("Desktop backend error: " + str(error), file=sys.stderr)
        raise SystemExit(1) from error
