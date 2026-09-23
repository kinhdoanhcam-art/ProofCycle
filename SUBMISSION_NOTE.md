# PrereqLock — Submission Note

## One-line summary

AI-validator consensus decides whether a condition is truly necessary, then a two-wallet state machine prevents the nominated actor from performing the guarded action until the creator records that condition.

## Contract

```text
Name: PrereqLock
Network: GenLayer StudioNet (61999)
Version: 1.1
Source: contract/PrereqLock.py
SHA-256: 1e47fd114f12c4d22d515ef4af4435082269d5e1524110371e3eec111320ab55
Address: 0xa81d04e3D7CC2f6e696666453b1ddD679b88c430
Deploy TX: 0xb02fd55c9394cdd94dcb6af66364b2a66e94a067db9d66fe43c38299ad0e94e1
```

## Links

```text
GitHub: NOT PUBLISHED
Live dApp: https://prereq-lock-eosin.vercel.app
Explorer: https://explorer-studio.genlayer.com/address/0xa81d04e3D7CC2f6e696666453b1ddD679b88c430
```

## Verification state

Offline source checks, Unicode parity, `npm ci`, typecheck, production build and the current StudioNet v1.1 deployment are `PASS`. K1-K5 semantic classification, split-role execution, replay protection and the two-attempt bound passed on a previous deployment of the same source hash. Full hashes and scope labels are recorded in `TESTING.md`.

The Vercel UI and wallet/RPC path were exercised during deployment setup. A fresh full state-flow test against the current address remains `NOT RUN`; add the final GitHub URL above after publishing.
