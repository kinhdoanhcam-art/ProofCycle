# ProofCycle / ObligationProof — Testing

## Exact frozen source

Public project file:

`contracts/ProofCycle.py`

SHA256:

`5588c08cf5b5e82ad4a1b8776c8c55fa48f8b8ec1f8b923cd2c2c69028c2df69`

The file bytes are the exact frozen `ObligationProof` R2 implementation. Only the public filename is project-branded.

## Deployments

Clean Project address:

`0xcd661Ee97B358948c4B943C8d2B5f4195E54D75E`

Runtime evidence address:

`0x50B778A214AD3e83E5eA24Da939636AE2547A5Ab`

The clean Project deployment reported `obligation_count = 0` and matched the expected source profile before frontend work.

## Live source profile

Expected / observed profile:

- `name = ObligationProof`
- `version = 1.1`
- verdicts = `COMPLIANCE_SATISFIED`, `COMPLIANCE_DEFICIENT`
- deterministic missed outcome = `MISSED`
- statuses = `ACTIVE`, `AT_RISK`, `NON_COMPLIANT`
- `cache_scope = OBLIGATION`
- `semantic_scope = TEXTUAL_EVIDENCE_SUPPORT`
- `external_truth_verified = false`
- `max_fresh_semantic_evals_per_period = 2`

## Runtime verification

Durable postconditions were read from Finalized state on the runtime-evidence deployment.

### 1. Obligation creation baseline — PASS

A recurring obligation was created with a separate creator and responsible party, a 600-second period, and a 300-second remediation window.

Finalized baseline:

- `settled_through = 0`
- `satisfied_count = 0`
- `deficient_count = 0`
- `missed_count = 0`
- `streak = 0`
- `semantic_eval_count = 0`
- `status = ACTIVE`

### 2. Deficient evidence without premature aggregate writes — PASS

Evidence supported uptime but omitted scheduled-backup support.

Finalized period #1:

- `initial_verdict = COMPLIANCE_DEFICIENT`
- `initial_used_cache = false`
- `closed = false`
- `remediation_open = true`

The obligation still had `deficient_count = 0`, `settled_through = 0`, and `status = ACTIVE`. Semantic classification therefore did not bypass ordered settlement.

### 3. Exact remediation cache / no reroll — PASS

The exact same deficient evidence was reused for remediation.

Finalized result:

- `remediation_verdict = COMPLIANCE_DEFICIENT`
- `remediation_used_cache = true`
- `closed = true`
- `final_outcome = COMPLIANCE_DEFICIENT`
- `semantic_eval_count` remained `1`

### 4. Ordered settlement to AT_RISK — PASS

After settlement of period #1:

- `settled_through = 1`
- `deficient_count = 1`
- `missed_count = 0`
- `streak = 0`
- `semantic_eval_count = 1`
- `status = AT_RISK`

### 5. Cross-period obligation-scoped cache reuse — PASS

The exact same evidence was submitted in period #2.

Finalized period #2:

- `initial_verdict = COMPLIANCE_DEFICIENT`
- `initial_used_cache = true`
- `semantic_eval_count` remained `1`

### 6. Period #2 remediation cache reuse — PASS

The same evidence was used again for remediation:

- `remediation_verdict = COMPLIANCE_DEFICIENT`
- `remediation_used_cache = true`
- `closed = true`
- `final_outcome = COMPLIANCE_DEFICIENT`

### 7. Deterministic escalation to NON_COMPLIANT — PASS

After period #2 settlement:

- `settled_through = 2`
- `deficient_count = 2`
- `satisfied_count = 0`
- `missed_count = 0`
- `streak = 0`
- `semantic_eval_count = 1`
- `status = NON_COMPLIANT`

This proves that finalized deficient periods contribute to the deterministic failure status rather than leaving the obligation indefinitely `AT_RISK`.

## Frontend verification requirements

Before submission, run:

```bash
npm run verify
npm run build
```

Then deploy to Vercel and perform a read-only smoke test against the clean Project address:

1. overview reports zero obligations and the expected profile;
2. create form loads without demo values;
3. obligation/evidence/remediation/settlement pages use empty states until an obligation is opened;
4. Proof page shows the correct clean Project address, runtime-evidence address, and frozen SHA;
5. wallet connection succeeds on StudioNet;
6. Explorer links resolve to the intended addresses.

The clean Project address should remain free of demo writes unless a project-level write test is explicitly required.
