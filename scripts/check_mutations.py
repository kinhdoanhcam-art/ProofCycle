"""Confirm that regression tests detect six specific broken contract variants.

Mutations exist only in a temporary directory. Production bytes are never edited.
This is a test-sensitivity check, not StudioNet evidence.
"""
from pathlib import Path
import os
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "contracts" / "ProofCycle.py"

CASES = [
    ("issuer authorization", "if gl.message.sender_address != ob.evidence_issuer:", "if False:",
     "test_only_designated_issuer_can_create_report"),
    ("completed observation window", "if now < self._period_end(ob, number):", "if False:",
     "test_observation_period_must_end_before_report_or_judgment"),
    ("immutable issuer report", 'if self.reports.get(key, self._empty_report()).report_digest:', "if False:",
     "test_report_cannot_be_replaced_even_before_first_judgment"),
    ("period cache isolation", '"ProofCycle:period-cache:2", int(oid), number, str(ob.evidence_issuer),',
     '"ProofCycle:period-cache:2", int(oid), str(ob.evidence_issuer),',
     "test_new_period_requires_fresh_signed_report_and_has_no_cross_period_cache"),
    ("semantic fail closed", 'raise gl.vm.UserError("Semantic evaluation failed")', "return SATISFIED",
     "test_malformed_or_uncertain_semantics_leave_all_storage_unchanged"),
    ("persistent settled failures", 'failures = int(ob.deficient_count) + int(ob.missed_count)',
     'failures = int(ob.deficient_count) + int(ob.missed_count) - int(ob.satisfied_count)',
     "test_later_success_never_clears_settled_failure_history"),
]


def main():
    original = SOURCE.read_bytes()
    text = original.decode("utf-8")
    env = dict(os.environ, PYTEST_DISABLE_PLUGIN_AUTOLOAD="1", PYTHONDONTWRITEBYTECODE="1")
    for label, old, new, test in CASES:
        if text.count(old) != 1:
            raise SystemExit("Mutation target changed: " + label)
        with tempfile.TemporaryDirectory(prefix="proofcycle-mutation-") as folder:
            mutant = Path(folder) / "ProofCycle.py"
            mutant.write_text(text.replace(old, new, 1), encoding="utf-8", newline="\n")
            env["PROOFCYCLE_TEST_CONTRACT"] = str(mutant)
            result = subprocess.run(
                [sys.executable, "-m", "pytest", "-p", "gltest.direct.pytest_plugin", "-q", "-s", "-k", test],
                cwd=ROOT, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace",
            )
            # Exit 1 is an assertion failure. Collection/import errors (2+)
            # are infrastructure failures, not a detected behavioral mutation.
            if result.returncode != 1 or " failed" not in result.stdout or "ERROR " in result.stdout:
                print(result.stdout, result.stderr)
                raise SystemExit("Mutation was not detected behaviorally: " + label)
        print("DETECTED: " + label, flush=True)
    if SOURCE.read_bytes() != original:
        raise SystemExit("Production source was unexpectedly modified")
    print(str(len(CASES)) + "/" + str(len(CASES)) + " targeted mutations detected; production source unchanged")


if __name__ == "__main__":
    main()
