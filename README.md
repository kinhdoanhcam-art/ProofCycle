# PrereqLock

PrereqLock is a GenLayer Intelligent Contract and reviewer-facing dApp that turns one narrow semantic decision into a real authorization boundary:

> Does an immutable rule make a nominated condition necessary before a nominated action is permitted?

Validators return exactly one of:

```text
CONDITION_NECESSARY
CONDITION_NOT_NECESSARY
```

Only `CONDITION_NECESSARY` installs the prerequisite edge. The creator may then record the condition, but only a separate actor wallet may perform the guarded action.

## Repository map

```text
contract/PrereqLock.py   Intelligent Contract submitted to GenLayer Studio
src/                     Vite + React dApp
api/rpc.js               same-origin StudioNet RPC proxy for Vercel
tests/                   offline source, vector and Unicode-parity checks
TESTING.md                contract runtime plan and evidence ledger
FRONTEND_TESTING.md       frontend test plan and execution ledger
```

The project, contract file and contract class are all named `PrereqLock`.

## Contract identity

```text
Network: GenLayer StudioNet (chain 61999)
Version: 1.1
Source: contract/PrereqLock.py
SHA-256: 1e47fd114f12c4d22d515ef4af4435082269d5e1524110371e3eec111320ab55
Contract address: 0xa81d04e3D7CC2f6e696666453b1ddD679b88c430
Deploy transaction: 0xb02fd55c9394cdd94dcb6af66364b2a66e94a067db9d66fe43c38299ad0e94e1
Creator: 0x3065E31B1D993d7C0D59E6786844cBa56780B2d3
```

This is the current Project deployment of the source hash above. StudioNet reported `FINALIZED`, GenVM `SUCCESS` and consensus `Accepted` for the deployment.

- Explorer: https://explorer-studio.genlayer.com/address/0xa81d04e3D7CC2f6e696666453b1ddD679b88c430
- Deploy transaction: https://explorer-studio.genlayer.com/tx/0xb02fd55c9394cdd94dcb6af66364b2a66e94a067db9d66fe43c38299ad0e94e1
- Observed deployment result: `FINALIZED`, GenVM `SUCCESS`, consensus `Accepted`.

## Roles

| Role | Authority |
| --- | --- |
| Creator | Creates the gate, submits semantic rules and records that the condition has been met. |
| Actor | A distinct wallet. It alone may perform the guarded action after the edge is installed and the condition is recorded. |
| Observer | Reads accepted state and the immutable rule-attempt log. |

`create_gate` rejects a creator/actor collision and the zero actor address.

## State machine

```text
LOCKED
  | CONDITION_NECESSARY
  v
ARMED
  | creator: record_condition
  v
READY
  | actor: perform_action
  v
DONE
```

`CONDITION_NOT_NECESSARY` leaves the gate `LOCKED`. There is no alternate method that installs the edge.

## Grinding bound

Each gate permits at most **2** semantic attempts. Exact rule replay is also rejected, and an installed edge permanently closes the submission lane.

For a truly non-necessary rule and a model with accuracy `p`, the probability of at least one false `CONDITION_NECESSARY` across `n` rewrites is `1 - p^n`:

```text
n = 2, p = 90%  ->  19%
n = 3, p = 90%  ->  27%
n = 5, p = 90%  ->  41%
```

The two-attempt limit was selected to reduce rewrite grinding while retaining one opportunity to clarify a genuinely ambiguous rule.

## Prompt and output safety

- User text containing prompt delimiters, verdict labels or rubric headers is rejected rather than modified.
- Rule text is normalized with Python whitespace semantics before hashing and classification.
- The browser mirrors the same normalization for local rule IDs.
- Invalid JSON, a non-object response or an unknown verdict raises `Invalid semantic output`; no attempt or fabricated verdict survives the transaction rollback.
- `exec_prompt` remains inside `run_nondet_unsafe`; no nondeterministic source is used elsewhere.
- `get_config()` exposes the rubric hash for source verification.

## Honest scope

- `record_condition()` is a contract-local declaration by the creator. It is not external proof that an event occurred.
- `perform_action()` records contract-local completion by the nominated actor. It does not prove an off-chain action occurred.
- The contract enforces the two-wallet on-chain sequence; it does not evaluate legality, fairness or external documents.

## Local verification

```bash
python3 tests/verify_contract_source.py
python3 tests/verify_kill_suite.py
node tests/verify_ids.mjs
npm ci
npm run typecheck
npm run build
python3 -m py_compile contract/PrereqLock.py
```

Verified locally on 2026-09-23 UTC:

```text
contract source invariants: PASS
K1-K5 shortcut resistance: PASS
pyStrip/pyCollapse full Unicode parity: PASS
npm ci: PASS
TypeScript typecheck: PASS
Vite production build: PASS
Python syntax compilation: PASS
```

These offline results are separate from StudioNet evidence. The K1-K5 runtime semantic suite, creator/actor authorization flow, replay protection and two-attempt bound were exercised on a previous deployment of the same v1.1 source hash. The current address has a verified deployment; fresh application-flow revalidation is still pending. Full historical transaction hashes and scope labels are recorded in `TESTING.md`.

## Frontend configuration

```bash
cp .env.example .env.local
```

The deployed v1.1 address is already configured:

```text
VITE_CONTRACT_ADDRESS=0xa81d04e3d7cc2f6e696666453b1ddd679b88c430
VITE_RPC_PATH=/api/rpc
```

The dApp uses accepted-state matching as its primary confirmation mechanism. Only after the delayed state check fails to observe the expected transition does it inspect the leader receipt to distinguish a finalized rollback from a slow transaction. It never resubmits automatically.
