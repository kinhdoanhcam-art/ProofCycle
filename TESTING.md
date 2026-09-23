# PrereqLock v1.1 — Testing and Evidence Ledger

Only an actually observed result may be marked `PASS`. A submitted, accepted or finalized transaction is not considered successful unless its execution result and exact postcondition also match the test.

## Canonical deployment

```text
Network: GenLayer StudioNet (61999)
Contract: PrereqLock
Source SHA-256: 1e47fd114f12c4d22d515ef4af4435082269d5e1524110371e3eec111320ab55
Address: 0xa81d04e3D7CC2f6e696666453b1ddD679b88c430
Deploy TX: 0xb02fd55c9394cdd94dcb6af66364b2a66e94a067db9d66fe43c38299ad0e94e1
Explorer: https://explorer-studio.genlayer.com/address/0xa81d04e3D7CC2f6e696666453b1ddD679b88c430
Deploy TX explorer: https://explorer-studio.genlayer.com/tx/0xb02fd55c9394cdd94dcb6af66364b2a66e94a067db9d66fe43c38299ad0e94e1
Creator wallet: 0x3065E31B1D993d7C0D59E6786844cBa56780B2d3
Planned production actor wallet: 0x5a52d040581a76e2c032542855d31480f2ea7097
Historical runtime-suite actor: 0x86895976a0c43A9Be69b1DEd865e9726eE80BA77
Outsider wallet: NOT RECORDED
```

The current deployment uses the same verified v1.1 source hash as the historical runtime suite below. Those historical rows remain evidence for that byte-identical source, but they are not represented as transactions against the current address.

Deployment observation on 2026-09-23:

```text
Transaction status: FINALIZED
GenVM result: SUCCESS
Consensus result: Accepted
Exact postcondition: contract created at 0xa81d04e3D7CC2f6e696666453b1ddD679b88c430
Result: PASS
```

## Offline gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Current StudioNet v1.1 deployment | PASS | Deploy TX `0xb02fd55c9394cdd94dcb6af66364b2a66e94a067db9d66fe43c38299ad0e94e1`; `FINALIZED`, GenVM `SUCCESS`, consensus `Accepted` |
| Python syntax | PASS | `python3 -m py_compile contract/PrereqLock.py` |
| Contract source invariants | PASS | `python3 tests/verify_contract_source.py` |
| K1-K5 shortcut resistance | PASS | `python3 tests/verify_kill_suite.py` |
| Full Unicode `pyStrip`/`pyCollapse` parity | PASS | `node tests/verify_ids.mjs` |
| Reproducible dependency install | PASS | `npm ci` using committed `package-lock.json` |
| TypeScript typecheck | PASS | `npm run typecheck` |
| Production build | PASS | `npm run build` |

Execution date: 2026-09-23 UTC.

## Historical semantic kill suite — byte-identical v1.1 deployment

The following runtime transactions were executed against the previous v1.1 address `0x75fa20dBD3b19E36736FDe62bDF49710571d4e81`, before StudioNet stopped serving that contract state. They are retained as historical regression evidence for the unchanged source hash, not as proof of state at the current address.

Use the same labels for every case:

```text
action_label = cargo leaving the depot
condition_label = a countersigned manifest
```

Necessary cases use separate gates because a necessary verdict installs the edge and closes that gate's submission lane. K3 was intentionally submitted as K2's second distinct non-necessary attempt so the same transaction also exercises the two-attempt bound.

| ID | Rule text | Expected | Gate ID | Create TX | Rule TX | Actual | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| K1 | `Cargo may leave the depot only after the manifest carries a countersignature.` | `CONDITION_NECESSARY` | `96fbd9c497aada67fcc9ad0db0e27a6b7faaa342f0449d67b3ae8737e7beda3c` | `0x47b4eb2168c3cff2e0de419a05cb2300a7d2caea4b7959cfc9833b2c199360b9` | `0x7f4e2226db3adf39254a202833efceac3116b4718286db2f82f212b4dd7f8652` | `CONDITION_NECESSARY` | PASS |
| K2 | `A countersignature on the manifest is enough for cargo to leave the depot.` | `CONDITION_NOT_NECESSARY` | `c98abff983731c2b56eebf9693e0acc214caabf861ccd2651547debbd2ded328` | `0x7722aa58b9dcaae217025a0fe926e6981a763bde2fbca7309ea963d90a97f927` | `0x797f73887b404e40f4ef17c7ee9533b03bda8b931790329c1ca80b710ca06f40` | `CONDITION_NOT_NECESSARY` | PASS |
| K3 | `The dispatcher shall countersign the manifest before each quarter closes.` | `CONDITION_NOT_NECESSARY` | `c98abff983731c2b56eebf9693e0acc214caabf861ccd2651547debbd2ded328` | K2 gate | `0x3ad64786aab21d9b762d6f39c298cc01554a38151c355e7812e6aeb9b51190cc` | `CONDITION_NOT_NECESSARY` | PASS |
| K4 | `Cargo may not leave the depot without a countersigned manifest; either the dispatcher or the night supervisor may countersign it.` | `CONDITION_NECESSARY` | `8a231d97d13dbb90d9ba3edfadd7cd4b2f265e072712dd1e69b8c19159855818` | `0xb0758d4257ccb93489acd07048450df59e83d271ce0bc495cc14441544a430af` | `0x2acf4feaea17ece999fb8ecfffa3ff9dbac32b93edf29907fa048ec747c0d075` | `CONDITION_NECESSARY` | PASS |
| K5 | `Cargo may leave the depot with a countersigned manifest, or with written clearance from the night supervisor instead.` | `CONDITION_NOT_NECESSARY` | `a22e24021c982af95d78c34bc0972c9d4903e845d8da93e16b4d8cf888f31fcc` | `0x0a8ec7ec90f6bb4a1dd79fc97f83b54874dbcba882e266fdfc4a870a724748b7` | `0x187312967074b8e37497b11200d59ad315727bd2cad9560bf14babb0aa758b95` | `CONDITION_NOT_NECESSARY` | PASS |

K4 is intentionally difficult: alternate signers are not alternate paths around the manifest requirement. If validators return the other label, record that actual finding; do not rewrite the evidence.

## Deterministic and authorization tests

Run these against K1 only after its accepted state shows `ARMED` and the semantic transaction has a successful execution result.

| Step | Caller | Expected result and postcondition | TX hash | Status |
| --- | --- | --- | --- | --- |
| Premature action | Actor | Revert `Condition has not been recorded`; state remains `ARMED` | `0x59481c73ea98e9aafad52771140347ce731c4b6dbf65ba150d29b914c0a5773c` | PASS |
| Wrong-role condition record | Actor | Revert `Only gate creator may record the condition`; state unchanged | `0xc55105012a6b9838f8dc91586853bb1137ff07002d9d162c130b80c810d70464` | PASS |
| Record condition | Creator | Success; accepted state is `READY`, `condition_met=true` | `0x3dff7b3bc5a375b914d7883d606f9292e43dacf6030617cadc7aa15861cc8a29` | PASS |
| Wrong-role action | Creator | Revert `Only gate actor may perform the action`; state remains `READY` | `0xa284c1af922a26497b347ffcea4c9a579f6616ea850e56882a1a06d1cff4b68e` | PASS |
| Outsider action | Outsider | Same actor-only revert; state unchanged | — | NOT RUN |
| Perform action | Actor | Success; accepted state is `DONE`, `action_done=true` | `0xff38f70e0fca0d594b7394f7923303696c3b1c2873ba4b3706bd8ce172f0983f` | PASS |
| Replay terminal action | Actor | Revert `Action has already been performed`; state remains `DONE` | `0x42e49bbf524ac74e7296ffc4d0928ad60c1add011751fe97d55157365d76eac9` | PASS |

## Replay, bound and injection tests

Use K2 while its gate is still `LOCKED`:

| Test | Expected | TX hash | Status |
| --- | --- | --- | --- |
| Replay exact K2 text immediately | Revert `Rule already exists`; `attempt_count` remains 1 | `0x59cf1364e48f3c52d7aadcd0516a9cf994b4f6d3842fd5f24bac6001b0315330` | PASS |
| Submit a second distinct non-necessary rule | Accepted result recorded; `attempt_count=2` | `0x3ad64786aab21d9b762d6f39c298cc01554a38151c355e7812e6aeb9b51190cc` | PASS |
| Submit a third distinct rule | Revert `Gate attempt limit reached`; `attempt_count=2` | `0x23a9313e9681e8d36a6634cb952887835342d2d7cc58c4ce95cba04341032881` | PASS |
| Submit text containing `</ACTION_LABEL>` on a fresh gate | Revert `Rule text contains a reserved prompt token`; no attempt recorded | — | NOT RUN |
| Create a gate where actor equals creator | Revert `Actor must be different from gate creator`; no gate created | — | NOT RUN |

Malformed-model-output rollback cannot be forced reliably through the public UI. Do not mark it `PASS` without a controlled runtime harness that produces the malformed result and verifies that no attempt or rule is stored.

## Excluded operator mistake

The first K5 gate accidentally received the K4 `may not leave` rule. It correctly returned `CONDITION_NECESSARY`, so it is excluded from K5 evidence rather than relabelled:

```text
Gate create TX: 0x7957bfcd1449aebc6d12db1d8cd949c43391fd4037aed6d5acfe711af5c49b41
Wrong-rule TX: 0xf715eda0cb4d0ec148737c6c3d12dae0f43c7ca306d4981cc36664ece8f47193
Observed verdict: CONDITION_NECESSARY
Disposition: excluded operator input; replacement K5 evidence is recorded above
```

## Evidence capture rule

For every on-chain row:

1. Record the full 66-character transaction hash and explorer `/tx/` link.
2. Verify `execution_result = SUCCESS` for success cases or record the exact rollback for negative cases.
3. Read accepted contract state and record the exact postcondition.

Do not blind-retry a transaction after receiving a hash.
