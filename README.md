# ProofCycle

ProofCycle is a Vite/React interface for the deployed GenLayer `ObligationProof` v2.0 contract on StudioNet. The designated issuer signs an immutable report after each observation period. The responsible party evaluates its exact stored digest; settlement deterministically derives period outcomes and aggregate status.

- Contract: [0x2B37e48581D888cc635Fd716456328F1411700D7](https://explorer-studio.genlayer.com/address/0x2B37e48581D888cc635Fd716456328F1411700D7)
- Deploy transaction: `0x150cd57a8813681eab65966d04e58a240bc47ef57d9bc5fc982181a70e20f270` — FINALIZED/SUCCESS
- Exact deployed source: `contracts/ProofCycle.py`, SHA256 `6070ef9c487e5fafbb8141e1d6c2722fea94333a218f40a79f9665049b9c7b0b`
- `get_config` version 2.0 and issuer-report profile observed on-chain; period-specific semantic verdicts, fresh and cached evaluations, remediation, ordered settlement, missed periods and a GenVM rollback were verified on obligation #1. See [RUNTIME_EVIDENCE.md](RUNTIME_EVIDENCE.md). Before submission, confirm that the GitHub commit and Vercel deployment contain this exact release.

## Run locally

`npm ci` then `npm run build` (static contract/profile checks, TypeScript, Vite) and `npm run dev` for browser development. For the full local contract gate, install Python 3.12+ dependencies with `python -m pip install -r requirements-test.txt` and run `python scripts/verify.py` (50 actual-source behavioral cases, official Direct Mode and GenVM lint). `npm run verify` additionally runs the frontend postcondition tests. Local model outputs are controlled by the test harness; they cannot prove real validator results.

## Deploy on Vercel

Commit the **contents** of this repository at the GitHub repo root (including `contracts`, `src`, `scripts`, `tests`, `package.json`, `package-lock.json`, `release.json`). Exclude `node_modules`, `dist`, caches and private environment files. Existing Vite config uses build command `npm run build`, output `dist`, and `vercel.json` for SPA routes. Remove a legacy `VITE_CONTRACT_ADDRESS` override in Vercel; a mismatched override intentionally locks writes. There is no backend or server secret.

Inspect the profile badge on the deployed page and open an obligation. A profile mismatch locks all writes. Connect three different StudioNet wallet accounts (creator, responsible party, issuer). Read [TESTING.md](TESTING.md) for the one-transaction-at-a-time runtime procedure. Before each signature confirm the method, role, period, target address and native value 0; wait for a finalized postcondition. Do not treat a transaction labeled FINALIZED as semantic or ledger proof on its own.

Issuer signatures authenticate control of the named wallet and bind the report to a completed period and requirement. Neither the contract nor validators establish the issuer’s real-world identity, independence, or the objective truth of its report. The issuer and referenced records need independent review. A URL or title alone does not prove the underlying compliance fact. Provenance, deadline, authorization, report immutability, caching and settlement rules are implemented by the contract.
