from datetime import datetime, timedelta, timezone
from dataclasses import fields
from pathlib import Path
import json
import os
import sys
import pytest
from gltest.direct import create_address


@pytest.fixture
def h(direct_vm, direct_deploy):
    class Harness:
        vm = direct_vm
        creator = create_address("proofcycle-creator")
        responsible = create_address("proofcycle-responsible")
        issuer = create_address("proofcycle-issuer")
        outsider = create_address("proofcycle-outsider")
        origin = datetime(2026, 1, 1, tzinfo=timezone.utc)
        requirement = "The monitoring record must cover uptime and completion of the scheduled backup."
        observations = "The uptime monitor recorded the service throughout the interval; no backup result is present."

        def at(self, seconds):
            timestamp = (self.origin + timedelta(seconds=seconds)).isoformat().replace("+00:00", "Z")
            self.vm.warp(timestamp)
            # genlayer-test 0.29.2 updates sender/origin in message_raw but
            # leaves its datetime stale. Keep this SDK compatibility shim in
            # the harness, so the production chain clock is exercised unchanged.
            if "genlayer" in sys.modules:
                from genlayer import gl
                gl.message_raw["datetime"] = timestamp

        def as_role(self, role):
            self.vm.sender = getattr(self, role)

        def create(self):
            self.as_role("creator")
            self.c.create_obligation(str(self.responsible), str(self.issuer), "Operations evidence issuer",
                                     self.requirement, 600, 300, 300)
            return self.c.get_config()["obligation_count"]

        def attest(self, number=1, body=None, remediation=False, oid=1, reference="record/primary"):
            self.as_role("issuer")
            method = self.c.attest_remediation_report if remediation else self.c.attest_period_report
            method(oid, number, reference, self.observations if body is None else body)
            return self.c.get_report(oid, number, remediation)["report_digest"]

        def mock(self, verdict="COMPLIANCE_DEFICIENT", raw=None):
            self.vm.clear_mocks()
            self.vm.mock_llm(r".*", json.dumps({"verdict": verdict}) if raw is None else raw)

        def evaluate(self, number=1, remediation=False, oid=1, digest=None):
            self.as_role("responsible")
            if digest is None:
                digest = self.c.get_report(oid, number, remediation)["report_digest"]
            method = self.c.remediate_period if remediation else self.c.submit_period_evidence
            method(oid, number, digest)

        def storage(self):
            # Snapshot every reachable production storage value. The Direct
            # Mode SDK also allocates temporary dataclasses in its arena, so
            # raw allocator bytes are not an on-chain state comparison.
            # No automatic revert is used to make failure tests pass.
            from genlayer import Address
            def record(value):
                return {field.name: (str(getattr(value, field.name))
                        if isinstance(getattr(value, field.name), Address)
                        else getattr(value, field.name)) for field in fields(value)}
            return {
                "obligation_counter": int(self.c.obligation_counter),
                "obligations": {int(k): record(v) for k, v in self.c.obligations.items()},
                "periods": {k: record(v) for k, v in self.c.periods.items()},
                "reports": {k: record(v) for k, v in self.c.reports.items()},
                "verdict_cache": dict(self.c.verdict_cache.items()),
            }

        def refused(self, message, call):
            before = self.storage()
            from genlayer import gl
            with pytest.raises(gl.vm.UserError, match=message):
                call()
            assert self.storage() == before

        def deficient(self):
            self.at(600)
            self.attest()
            self.mock()
            self.evaluate()

    fixture = Harness()
    fixture.at(0)
    fixture.as_role("creator")
    path = Path(os.environ.get("PROOFCYCLE_TEST_CONTRACT", Path(__file__).parents[1] / "contracts/ProofCycle.py"))
    fixture.c = direct_deploy(str(path), sdk_version="v0.2.12")
    # create_address can return bytes before the SDK is first imported.
    # Normalize test identities after loading the SDK; production is unchanged.
    from genlayer import Address
    for role in ("creator", "responsible", "issuer", "outsider"):
        address = getattr(fixture, role)
        setattr(fixture, role, Address(address if isinstance(address, bytes) else str(address)))
    fixture.create()
    return fixture
