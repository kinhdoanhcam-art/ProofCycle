# ProofCycle

**Recurring evidence. Deterministic compliance state.**

ProofCycle is a product interface for the frozen `ObligationProof` GenLayer Intelligent Contract. It tracks recurring textual compliance evidence across deterministic reporting periods, remediation windows, ordered settlement, and derived obligation status.

## Project identity

- Project: **ProofCycle**
- Public project contract filename: `contracts/ProofCycle.py`
- Frozen contract implementation: `ObligationProof`
- Contract version: `1.1`
- Project address: `0xcd661Ee97B358948c4B943C8d2B5f4195E54D75E`
- Runtime evidence address: `0x50B778A214AD3e83E5eA24Da939636AE2547A5Ab`
- Frozen source SHA256: `5588c08cf5b5e82ad4a1b8776c8c55fa48f8b8ec1f8b923cd2c2c69028c2df69`

Renaming the public file to `ProofCycle.py` does not alter the frozen contract bytes. The implementation still reports `name = ObligationProof`, preserving exact source parity with the runtime-tested deployment.

## What it does

A creator defines:

- a responsible-party wallet;
- immutable requirement text;
- a recurring period length;
- a remediation window shorter than the period.

The responsible party submits evidence during each period. GenLayer validators answer only whether the submitted text supports every mandatory requirement in the immutable requirement text.

The semantic layer does **not** decide:

- submission timing;
- period boundaries;
- missed periods;
- remediation deadlines;
- aggregate counters;
- streak;
- overall status;
- external truth.

Those consequences remain deterministic contract logic.

## Status model

Ordered settlement derives the aggregate status from finalized failures:

- `ACTIVE`: zero settled failures;
- `AT_RISK`: one settled failure;
- `NON_COMPLIANT`: two or more settled failures.

A failure is either a finalized `COMPLIANCE_DEFICIENT` period or deterministic `MISSED` period.

## Cache / anti-reroll model

The semantic cache is scoped to the obligation and exact evidence text. Exact evidence reuse can therefore reuse the prior verdict across remediation or later periods without consuming another fresh semantic evaluation.

The live profile exposes:

- `cache_scope = OBLIGATION`
- `semantic_scope = TEXTUAL_EVIDENCE_SUPPORT`
- `max_fresh_semantic_evals_per_period = 2`
- `external_truth_verified = false`

## Frontend safety model

The frontend:

- reads contract state with `stateStatus: finalized`;
- waits for transaction finalization;
- checks execution result when the SDK exposes it;
- verifies finalized postconditions after writes;
- does not treat `FINALIZED` alone as proof of successful execution;
- keeps the clean Project deployment separate from the runtime-evidence deployment.

## Pages

- **Cycle** — protocol overview and live source profile.
- **Create** — create a recurring obligation.
- **Obligation** — inspect finalized requirement, period, counters, and status.
- **Evidence** — submit current-period textual evidence.
- **Remediation** — inspect and use the one-attempt remediation path.
- **Settlement** — permissionless ordered settlement and finalized period ledger.
- **Proof** — project address, runtime evidence, source hash, and runtime gates.

## Run locally

```bash
npm install
npm run verify
npm run build
npm run dev
```

`npm run verify` checks the frozen contract SHA, required source markers, address parity, public contract filename, and public-package hygiene.
