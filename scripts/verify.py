"""One command: source integrity, SDK validation and real contract behavior.

Run with the same Python interpreter used to install requirements-test.txt.
An exit code of zero proves local gates only; it is not a StudioNet pass.
"""
from pathlib import Path
import ast
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "ProofCycle.py"


def main():
    if sys.version_info < (3, 12):
        raise SystemExit("Python 3.12 or newer is required")
    manifest = json.loads((ROOT / "release.json").read_text(encoding="utf-8"))
    source = CONTRACT.read_bytes()
    actual = hashlib.sha256(source).hexdigest()
    if actual != manifest["contract_sha256"]:
        raise SystemExit("FAIL: contract SHA256 mismatch")
    sha_line = (ROOT / "SOURCE_SHA256.txt").read_text(encoding="utf-8").split()
    if sha_line != [actual, "contracts/ProofCycle.py"]:
        raise SystemExit("FAIL: SOURCE_SHA256 does not match production source")
    compile(ast.parse(source.decode("utf-8")), str(CONTRACT), "exec")

    if (manifest["stage"] != "RUNTIME_VERIFIED_FRONTEND_INTEGRATED" or
            manifest["deployment_address"].lower() != "0x2b37e48581d888cc635fd716456328f1411700d7" or
            not manifest["runtime_verified"] or not manifest["semantic_live_verified"] or
            not manifest["frontend_integrated"]):
        raise SystemExit("FAIL: deployment/frontend stage claims do not match available evidence")
    checked = set()
    for line in (ROOT / "FINAL_CHECKSUMS.txt").read_text(encoding="utf-8").splitlines():
        digest, path = line.split("  ", 1)
        file = (ROOT / path).resolve()
        if not file.is_relative_to(ROOT) or hashlib.sha256(file.read_bytes()).hexdigest() != digest:
            raise SystemExit("FAIL: file checksum mismatch: " + path)
        if path in checked:
            raise SystemExit("FAIL: duplicate checksum entry")
        checked.add(path)
    local_dirs = {".git", ".venv", "__pycache__", ".pytest_cache", "artifacts", "node_modules", "dist"}
    files = {p.relative_to(ROOT).as_posix() for p in ROOT.rglob("*") if p.is_file()
             and not local_dirs.intersection(p.relative_to(ROOT).parts)
             and p.name != "FINAL_CHECKSUMS.txt" and not p.name.startswith(".env")
             and not p.name.endswith(".tsbuildinfo") and p.suffix != ".pyc"}
    if files != checked:
        raise SystemExit("FAIL: checksum inventory does not match package files")
    print("Source SHA256 and package checksums PASS: " + actual, flush=True)

    env = dict(os.environ, GENVM_VERSION="v0.2.12", PYTHONDONTWRITEBYTECODE="1",
               PYTEST_DISABLE_PLUGIN_AUTOLOAD="1", PYTHONUTF8="1")
    # Verification must always target the packaged production contract.
    env.pop("PROOFCYCLE_TEST_CONTRACT", None)
    env.pop("PYTEST_ADDOPTS", None)
    env.pop("PYTEST_PLUGINS", None)
    lint = subprocess.run(
        [sys.executable, "-c", "from genvm_linter.cli import main; main()", "check", str(CONTRACT), "--json"],
        cwd=ROOT, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if lint.returncode:
        print(lint.stdout, lint.stderr)
        raise SystemExit("FAIL: SDK/lint validation did not pass")
    result = json.loads(lint.stdout)
    if not result.get("ok"):
        raise SystemExit("FAIL: SDK/lint validation reported failure")
    print("GenVM lint and SDK/schema validation PASS", flush=True)

    with tempfile.TemporaryDirectory(prefix="proofcycle-verification-") as folder:
        report = Path(folder) / "results.xml"
        behavior = subprocess.run(
            [sys.executable, "-m", "pytest", "-p", "gltest.direct.pytest_plugin", "-q", "-s", "tests",
             "--junitxml=" + str(report)], cwd=ROOT, env=env,
        )
        if behavior.returncode:
            raise SystemExit("FAIL: production contract behavioral suite did not pass")
        cases = list(ET.parse(report).getroot().iter("testcase"))
        if len(cases) != manifest["behavioral_cases"] or any(list(case) for case in cases):
            raise SystemExit("FAIL: expected case count not met or a case was skipped/failed")
    if hashlib.sha256(CONTRACT.read_bytes()).hexdigest() != actual:
        raise SystemExit("FAIL: production source changed during verification")
    print("LOCAL VERIFICATION PASS. Live transactions and finalized postconditions are documented in RUNTIME_EVIDENCE.md; this run does not re-execute StudioNet transactions.", flush=True)


if __name__ == "__main__":
    main()
