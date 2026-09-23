# PrereqLock v1.1 — Frontend Testing

This document separates the test procedure from the execution ledger. Expected behavior is not evidence that the behavior was observed.

## Automated local checks

```text
npm ci: PASS (2026-09-23 UTC)
npm run typecheck: PASS
npm run build: PASS
```

The production build completed with a non-blocking bundle-size warning. The Vercel UI, wallet connection and same-origin RPC path were exercised during deployment setup; the full state flow against the current contract address remains pending.

## Manual procedure

### 1. Wallet roles and gate creation

1. Connect the creator wallet on StudioNet.
2. Enter a different valid actor wallet and create a gate.
3. Record the full transaction hash; after accepted-state refresh, verify the displayed creator and actor match the inputs and state is `LOCKED`.

Expected UI properties:

- creator wallet is labelled `Creator controls`;
- actor wallet is labelled `Actor controls action` after switching accounts;
- every other wallet sees `Read only`;
- the transaction banner links to the exact explorer transaction.

### 2. Consensus and accepted state

1. As creator, submit one kill-suite rule.
2. Confirm the button remains locked while the expected accepted transition is pending.
3. Verify the accepted state and immutable attempt log after consensus.

Expected behavior:

- no automatic resubmission;
- local rule ID uses collapsed Python whitespace;
- accepted-state matching is primary;
- after timeout only, a finalized leader rollback is shown as an error;
- a slow transaction remains pending rather than being labelled successful.

### 3. Split-role execution

1. As creator, record the condition after a necessary verdict.
2. Switch to the actor wallet and reload the gate.
3. Perform the guarded action and verify accepted state `DONE`.

The creator action button must remain disabled; the actor record-condition button must remain disabled.

### 4. Resilience and layout

Verify:

- disconnected state;
- account and chain changes clear wallet-scoped state;
- observer/read-only mode;
- long labels and rule text;
- mobile viewport;
- stale pending transaction handling;
- manual accepted-state refresh;
- Rule log after one and two attempts.

## Execution ledger

| Environment | URL/build | Wallet flow | State flow | Rollback display | Responsive UI | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Local production build | `dist/` | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| Vercel production | `https://prereq-lock-eosin.vercel.app` | PARTIAL | NOT RUN on current address | PARTIAL | PASS desktop | NOT RUN |

Do not change a row to `PASS` without recording date, URL, wallet roles and transaction hashes in `TESTING.md`.
