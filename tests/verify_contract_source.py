from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "contract" / "PrereqLock.py").read_text(encoding="utf-8")


def require(fragment: str) -> None:
    if fragment not in SOURCE:
        raise AssertionError(f"missing required fragment: {fragment}")


def forbid(fragment: str) -> None:
    if fragment in SOURCE:
        raise AssertionError(f"forbidden fragment present: {fragment}")


require('class PrereqLock(gl.Contract):')
require('MAX_ATTEMPTS_PER_GATE = 2')
require('actor: Address')
require('"Only gate creator may record the condition"')
require('"Only gate actor may perform the action"')
require('"Actor must be different from gate creator"')
require('"Invalid actor address"')
require('raise gl.vm.UserError("Invalid semantic output")')
require('cleaned = " ".join(text.split())')

for token in (
    "<CONDITION_LABEL>",
    "</CONDITION_LABEL>",
    "<ACTION_LABEL>",
    "</ACTION_LABEL>",
    "ONLY QUESTION",
    "DECISION RULES",
    "DO NOT EVALUATE",
    "SECURITY RULE",
    "VERDICT",
):
    require(f'"{token}"')

forbid('self.gates = TreeMap()')
forbid('self.rules = TreeMap()')
forbid('self.attempts = TreeMap()')
forbid('return {"verdict": CONDITION_NOT_NECESSARY}')

print("contract source invariants: PASS")
