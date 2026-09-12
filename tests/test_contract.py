import json
import pytest

SAT = "COMPLIANCE_SATISFIED"
GAP = "COMPLIANCE_DEFICIENT"


def test_live_profile_and_immutable_source_baseline(h):
    cfg = h.c.get_config()
    assert cfg["version"] == "2.0"
    assert cfg["evidence_mode"] == "AUTHENTICATED_ISSUER_REPORT"
    assert cfg["cache_scope"] == "OBLIGATION_PERIOD"
    assert cfg["self_submitted_text_allowed"] is False
    assert cfg["external_truth_verified"] is False
    ob = h.c.get_obligation(1)
    assert ob["evidence_issuer"].lower() == str(h.issuer).lower()
    assert ob["settled_through"] == ob["semantic_eval_count"] == 0
    assert ob["latest_completed_period"] == 0
    assert ob["status"] == "ACTIVE"


@pytest.mark.parametrize("role", ["creator", "responsible", "outsider"])
def test_only_designated_issuer_can_create_report(h, role):
    h.at(600)
    h.as_role(role)
    h.refused("Only the designated evidence issuer", lambda: h.c.attest_period_report(1, 1, "forged", h.observations))
    assert h.c.get_report(1, 1, False)["exists"] is False


@pytest.mark.parametrize("role", ["creator", "issuer", "outsider"])
def test_only_responsible_party_can_evaluate_authenticated_report(h, role):
    h.at(600)
    digest = h.attest()
    h.mock(SAT)
    h.as_role(role)
    h.refused("Only the responsible party", lambda: h.c.submit_period_evidence(1, 1, digest))
    assert h.c.get_obligation(1)["semantic_eval_count"] == 0


def test_self_submitted_text_without_issuer_report_is_refused(h):
    h.at(600)
    h.as_role("responsible")
    h.mock(SAT)
    h.refused("Authenticated period report is required", lambda: h.c.submit_period_evidence(1, 1, "Everything complied."))
    assert not h.c.get_period(1, 1)["initial_verdict"]


def test_same_call_before_and_after_issuer_attestation(h):
    h.at(600)
    h.as_role("responsible")
    h.refused("Authenticated period report is required", lambda: h.c.submit_period_evidence(1, 1, ""))
    digest = h.attest()
    h.mock(SAT)
    h.evaluate(digest=digest)
    assert h.c.get_period(1, 1)["initial_verdict"] == SAT
    assert h.c.get_obligation(1)["satisfied_count"] == 0


def test_observation_period_must_end_before_report_or_judgment(h):
    h.at(599)
    h.as_role("issuer")
    h.refused("Observation period has not ended", lambda: h.c.attest_period_report(1, 1, "premature", h.observations))
    h.as_role("responsible")
    h.refused("Observation period has not ended", lambda: h.c.submit_period_evidence(1, 1, "fake"))
    h.at(600)
    h.attest()
    report = h.c.get_report(1, 1, False)
    assert report["attested_at"] >= report["period_end"]
    assert report["period_end"] - report["period_start"] == 600


def test_report_digest_commits_provenance_body_and_period(h):
    h.at(600)
    digest = h.attest()
    report = h.c.get_report(1, 1, False)
    ob = h.c.get_obligation(1)
    from genlayer import gl, Keccak256
    payload = json.dumps([
        "ProofCycle:issuer-report:2", str(gl.message.contract_address), 1, 1, "initial",
        report["evidence_issuer"], report["responsible_party"], report["source_name"],
        ob["requirement_digest"], report["period_start"], report["period_end"], report["attested_at"],
        report["record_reference"], report["evidence_text"],
    ], separators=(",", ":"))
    assert Keccak256(payload.encode()).hexdigest() == digest
    assert len(digest) == 64


def test_report_cannot_be_replaced_even_before_first_judgment(h):
    h.at(600)
    h.attest()
    h.as_role("issuer")
    h.refused("immutable", lambda: h.c.attest_period_report(1, 1, "replacement", "A different account."))


def test_digest_mismatch_and_wrong_phase_fail_without_semantic_call(h):
    h.at(600)
    h.attest()
    h.as_role("responsible")
    h.refused("digest does not match", lambda: h.c.submit_period_evidence(1, 1, "f" * 64))
    h.mock()
    h.evaluate()
    initial = h.c.get_report(1, 1, False)["report_digest"]
    h.attest(remediation=True)
    h.as_role("responsible")
    h.refused("digest does not match", lambda: h.c.remediate_period(1, 1, initial))
    assert h.c.get_obligation(1)["semantic_eval_count"] == 1


def test_exact_text_new_reference_uses_same_period_cache(h):
    h.deficient()
    h.attest(remediation=True, reference="record/clarification")
    h.vm.clear_mocks()  # A fresh provider call would fail without a mock.
    h.evaluate(remediation=True)
    p = h.c.get_period(1, 1)
    assert p["remediation_used_cache"] is True
    assert p["remediation_verdict"] == GAP
    assert p["closed"] is True
    assert p["initial_deficient_history"] is True
    assert h.c.get_obligation(1)["semantic_eval_count"] == 1


def test_new_period_requires_fresh_signed_report_and_has_no_cross_period_cache(h):
    h.at(600)
    old_digest = h.attest()
    h.mock(SAT)
    h.evaluate()
    h.at(1200)
    h.as_role("responsible")
    h.refused("Authenticated period report", lambda: h.c.submit_period_evidence(1, 2, old_digest))
    new_digest = h.attest(number=2)
    assert new_digest != old_digest
    h.as_role("responsible")
    h.refused("digest does not match", lambda: h.c.submit_period_evidence(1, 2, old_digest))
    h.mock(GAP)
    h.evaluate(number=2)
    assert h.c.get_period(1, 2)["initial_verdict"] == GAP
    assert h.c.get_period(1, 2)["initial_used_cache"] is False
    assert h.c.get_obligation(1)["semantic_eval_count"] == 2


def test_cross_obligation_reports_and_cache_are_isolated(h):
    h.create()
    h.at(600)
    digest_one = h.attest(oid=1)
    h.mock(SAT)
    h.evaluate(oid=1)
    digest_two = h.attest(oid=2)
    assert digest_two != digest_one
    h.as_role("responsible")
    h.refused("digest does not match", lambda: h.c.submit_period_evidence(2, 1, digest_one))
    h.mock(GAP)
    h.evaluate(oid=2)
    assert h.c.get_period(2, 1)["initial_verdict"] == GAP
    assert h.c.get_obligation(2)["semantic_eval_count"] == 1


@pytest.mark.parametrize("raw", ["broken json", "null", "[]", "{}", '{"verdict":"UNCERTAIN"}',
                                  '{"verdict":"COMPLIANCE_SATISFIED","extra":true}',
                                  '{"verdict":true}', '{"verdict":"compliance_satisfied"}'])
def test_malformed_or_uncertain_semantics_leave_all_storage_unchanged(h, raw):
    h.at(600)
    h.attest()
    h.mock(raw=raw)
    h.refused("Semantic evaluation failed", lambda: h.evaluate())
    assert h.c.get_obligation(1)["semantic_eval_count"] == 0
    assert h.c.get_report(1, 1, False)["exists"] is True


def test_provider_failure_does_not_consume_judgment_or_change_report(h, monkeypatch):
    h.at(600)
    h.attest()
    from genlayer import gl
    def unavailable(*args, **kwargs):
        raise RuntimeError("provider unavailable")
    monkeypatch.setattr(gl.nondet, "exec_prompt", unavailable)
    h.refused("Semantic evaluation failed", lambda: h.evaluate())


def test_validator_rejects_disagreement_and_malformed_leader(h):
    h.at(600)
    h.attest()
    h.mock(SAT)
    h.evaluate()
    assert h.vm.run_validator() is True
    h.mock(GAP)
    assert h.vm.run_validator() is False
    assert h.vm.run_validator(leader_result={"verdict": SAT, "extra": 1}) is False
    assert h.vm.run_validator(leader_error=RuntimeError("leader failed")) is False


def test_consensus_failure_at_vm_boundary_leaves_all_storage_unchanged(h, monkeypatch):
    h.at(600)
    h.attest()
    h.mock(SAT)
    from genlayer import gl
    def disagreement(leader_fn, validator_fn):
        leader = leader_fn()
        h.mock(GAP)
        assert validator_fn(gl.vm.Return(calldata=leader)) is False
        raise gl.vm.UserError("Consensus did not converge")
    monkeypatch.setattr(gl.vm, "run_nondet_unsafe", disagreement)
    h.refused("Consensus did not converge", lambda: h.evaluate())


def test_remediation_failure_keeps_original_negative_history_and_report(h):
    h.deficient()
    h.attest(remediation=True, body="A corrected report includes the backup log.")
    h.mock(raw="not json")
    h.refused("Semantic evaluation failed", lambda: h.evaluate(remediation=True))
    p = h.c.get_period(1, 1)
    assert p["initial_deficient_history"] and p["remediation_verdict"] == ""
    assert h.c.get_obligation(1)["semantic_eval_count"] == 1


def test_new_authenticated_remediation_can_satisfy_without_erasing_history(h):
    h.deficient()
    h.attest(remediation=True, body="The monitoring archive includes both the uptime interval and the completed backup record.")
    h.mock(SAT)
    h.evaluate(remediation=True)
    p = h.c.get_period(1, 1)
    assert p["final_outcome"] == SAT and p["initial_deficient_history"]
    assert not p["remediation_used_cache"]
    assert h.c.get_obligation(1)["semantic_eval_count"] == 2
    assert h.c.get_obligation(1)["satisfied_count"] == 0
    h.as_role("outsider")
    h.c.settle_periods(1)
    assert h.c.get_obligation(1)["satisfied_count"] == 1


def test_remediation_requires_authenticated_report_and_cannot_skip_initial(h):
    h.at(600)
    h.as_role("issuer")
    h.refused("Only a deficient period", lambda: h.c.attest_remediation_report(1, 1, "skip", h.observations))
    h.deficient()
    h.as_role("responsible")
    h.refused("Authenticated period report", lambda: h.c.remediate_period(1, 1, "self-authored"))


def test_settlement_same_call_refusal_then_success_and_replay(h):
    h.at(600)
    h.as_role("outsider")
    h.refused("No ordered settlement", lambda: h.c.settle_periods(1))
    h.attest()
    h.mock(SAT)
    h.evaluate()
    assert h.c.get_obligation(1)["satisfied_count"] == 0
    h.as_role("outsider")
    h.c.settle_periods(1)
    ob = h.c.get_obligation(1)
    assert ob["satisfied_count"] == ob["settled_through"] == ob["streak"] == 1
    h.refused("No ordered settlement", lambda: h.c.settle_periods(1))


def test_unjudged_attested_report_eventually_becomes_missed(h):
    h.at(600)
    h.attest()
    h.at(901)
    h.as_role("outsider")
    h.c.settle_periods(1)
    assert h.c.get_period(1, 1)["final_outcome"] == "MISSED"
    assert h.c.get_report(1, 1, False)["exists"]
    assert h.c.get_obligation(1)["status"] == "AT_RISK"


def test_submission_deadline_equality_allowed_and_next_second_refused(h):
    h.at(900)
    h.attest()
    h.mock(SAT)
    h.evaluate()
    assert h.c.get_period(1, 1)["closed"]
    h.create()
    h.at(1801)  # Second obligation starts at offset 900.
    h.as_role("issuer")
    h.refused("Submission deadline has passed", lambda: h.c.attest_period_report(2, 1, "late", h.observations))


def test_remediation_deadline_equality_allowed_then_expires(h):
    h.deficient()
    h.at(900)
    h.as_role("outsider")
    h.refused("No ordered settlement", lambda: h.c.settle_periods(1))
    h.attest(remediation=True)
    h.evaluate(remediation=True)
    assert h.c.get_period(1, 1)["closed"]


def test_expired_deficiency_cannot_be_erased_by_late_report_or_evaluation(h):
    h.deficient()
    h.at(901)
    h.as_role("issuer")
    h.refused("Remediation deadline", lambda: h.c.attest_remediation_report(1, 1, "late", h.observations))
    h.as_role("responsible")
    h.refused("Remediation deadline", lambda: h.c.remediate_period(1, 1, "late"))
    h.as_role("outsider")
    h.c.settle_periods(1)
    assert h.c.get_obligation(1)["deficient_count"] == 1
    assert h.c.get_period(1, 1)["initial_deficient_history"]


def test_closed_period_prevents_issuer_mutation_and_responsible_replay(h):
    h.deficient()
    h.attest(remediation=True)
    h.evaluate(remediation=True)
    before = h.storage()
    h.as_role("issuer")
    h.refused("already final", lambda: h.c.attest_period_report(1, 1, "replace", "positive"))
    h.refused("already final", lambda: h.c.attest_remediation_report(1, 1, "replace", "positive"))
    h.as_role("responsible")
    h.refused("already recorded|period final", lambda: h.c.submit_period_evidence(1, 1, "replay"))
    h.refused("already final", lambda: h.c.remediate_period(1, 1, "replay"))
    assert h.storage() == before


def test_ordered_settlement_never_skips_earlier_period(h):
    h.at(600)
    h.attest()
    h.mock(GAP)
    h.at(900)
    h.evaluate()  # Remediation remains possible until offset 1200 inclusive.
    h.at(1200)
    h.attest(number=2)
    h.mock(SAT)
    h.evaluate(number=2)
    h.as_role("outsider")
    h.refused("No ordered settlement", lambda: h.c.settle_periods(1))
    h.at(1201)
    h.c.settle_periods(1)
    ob = h.c.get_obligation(1)
    assert ob["settled_through"] == 2 and ob["deficient_count"] == ob["satisfied_count"] == 1
    assert ob["status"] == "AT_RISK" and ob["streak"] == 1


def test_settlement_batch_cap_pagination_and_failure_escalation(h):
    h.at(600 * 55 + 301)
    h.as_role("outsider")
    h.c.settle_periods(1)
    assert h.c.get_obligation(1)["settled_through"] == 20
    h.c.settle_periods(1)
    assert h.c.get_obligation(1)["settled_through"] == 40
    h.c.settle_periods(1)
    ob = h.c.get_obligation(1)
    assert ob["settled_through"] == ob["missed_count"] == 55
    assert ob["status"] == "NON_COMPLIANT"
    first = h.c.get_periods(1, 1, 50)
    second = h.c.get_periods(1, 51, 50)
    assert [row["period_number"] for row in first + second] == list(range(1, 57))


@pytest.mark.parametrize("target", ["creator", "responsible"])
def test_source_cannot_be_creator_or_responsible(h, target):
    h.as_role("creator")
    h.refused("must be different", lambda: h.c.create_obligation(str(h.responsible), str(getattr(h, target)),
              "Source", h.requirement, 600, 300, 300))


def test_invalid_inputs_and_native_value_are_refused(h):
    h.as_role("creator")
    h.refused("Timing", lambda: h.c.create_obligation(str(h.responsible), str(h.issuer), "Source", h.requirement, 0, 1, 1))
    h.refused("shorter", lambda: h.c.create_obligation(str(h.responsible), str(h.issuer), "Source", h.requirement, 600, 600, 300))
    h.at(600)
    h.as_role("issuer")
    h.refused("empty or too long", lambda: h.c.attest_period_report(1, 1, "", h.observations))
    h.refused("future period", lambda: h.c.attest_period_report(1, 3, "future", h.observations))
    h.vm.value = 1
    h.refused("Native value", lambda: h.c.attest_period_report(1, 1, "paid", h.observations))


def test_nondeterministic_closures_are_serializable(h):
    h.at(600)
    h.attest()
    h.mock()
    h.evaluate()
    import cloudpickle
    _, leader, validator = h.vm._captured_validators[-1]
    assert cloudpickle.dumps(leader)
    assert cloudpickle.dumps(validator)


@pytest.mark.parametrize("role", ["creator", "issuer", "outsider"])
def test_remediation_evaluation_has_responsible_party_authorization(h, role):
    h.deficient()
    digest = h.attest(remediation=True)
    h.as_role(role)
    h.refused("Only the responsible party", lambda: h.c.remediate_period(1, 1, digest))


@pytest.mark.parametrize("role", ["creator", "responsible", "outsider"])
def test_remediation_report_has_issuer_authorization(h, role):
    h.deficient()
    h.as_role(role)
    h.refused("Only the designated evidence issuer", lambda: h.c.attest_remediation_report(1, 1, "forged", "all covered"))


def test_remediation_report_cannot_be_replaced_after_provider_error(h):
    h.deficient()
    h.attest(remediation=True, body="A new authenticated observation.")
    h.mock(raw="unavailable")
    h.refused("Semantic evaluation failed", lambda: h.evaluate(remediation=True))
    h.as_role("issuer")
    h.refused("immutable", lambda: h.c.attest_remediation_report(1, 1, "another record", "different observation"))


def test_later_success_never_clears_settled_failure_history(h):
    h.at(1501)
    h.as_role("outsider")
    h.c.settle_periods(1)
    assert h.c.get_obligation(1)["missed_count"] == 2
    h.at(1800)
    h.attest(number=3)
    h.mock(SAT)
    h.evaluate(number=3)
    h.as_role("outsider")
    h.c.settle_periods(1)
    ob = h.c.get_obligation(1)
    assert ob["status"] == "NON_COMPLIANT"
    assert ob["missed_count"] == 2 and ob["satisfied_count"] == 1 and ob["streak"] == 1
