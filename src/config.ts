// The deployed StudioNet contract is pinned. A stale Vercel override cannot reroute writes.
export const CONTRACT_ADDRESS = '0x2B37e48581D888cc635Fd716456328F1411700D7' as const;
export const CONFIG_OVERRIDE_MISMATCH = Boolean(import.meta.env.VITE_CONTRACT_ADDRESS &&
  import.meta.env.VITE_CONTRACT_ADDRESS.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase());
export const SOURCE_SHA256 = '6070ef9c487e5fafbb8141e1d6c2722fea94333a218f40a79f9665049b9c7b0b';
export const EXPECTED_CONTRACT_VERSION = '2.0';
export const DEPLOY_TX = '0x150cd57a8813681eab65966d04e58a240bc47ef57d9bc5fc982181a70e20f270';
export const EXPLORER_BASE = 'https://explorer-studio.genlayer.com';
export const CONTRACT_EXPLORER_URL = `${EXPLORER_BASE}/address/${CONTRACT_ADDRESS}`;
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
