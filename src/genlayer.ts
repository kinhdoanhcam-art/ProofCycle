import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import {
  CONTRACT_ADDRESS,
  RPC_PATH,
  STUDIONET_CHAIN_HEX,
  STUDIONET_CHAIN_ID,
  STUDIO_WALLET_RPC,
} from "./config";
import type { AttemptRecord, GateRecord } from "./types";

/**
 * genlayer-js routes only the wallet methods (eth_requestAccounts,
 * eth_sendTransaction, personal_sign, ...) to window.ethereum. EVERY other RPC
 * call it makes - eth_getTransactionCount, eth_estimateGas, eth_gasPrice - is a
 * plain fetch() to chain.rpcUrls.default.http[0].
 *
 * That means the WRITE client must use the proxied chain too, or those three
 * calls become direct cross-origin requests to studio.genlayer.com from the
 * browser. StudioNet returns 429 without CORS headers, and getCurrentNonce() is
 * not wrapped in try/catch inside the SDK, so a throttled response aborts the
 * write before MetaMask is ever asked to sign.
 */
function proxiedChain() {
  const chain: any = studionet as any;

  return {
    ...chain,
    rpcUrls: {
      ...(chain.rpcUrls ?? {}),
      default: { http: [RPC_PATH] },
      public: { http: [RPC_PATH] },
    },
  };
}

const readClient: any = createClient({
  chain: proxiedChain(),
} as any);

export async function getGate(gateId: string): Promise<GateRecord> {
  return (await readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_gate",
    args: [gateId],
    stateStatus: "accepted",
  })) as GateRecord;
}

export async function getAttempts(
  gateId: string,
  offset = 0,
  limit = 20
): Promise<AttemptRecord[]> {
  return (await readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_attempts",
    args: [gateId, offset, limit],
    stateStatus: "accepted",
  })) as AttemptRecord[];
}

/**
 * Called only after accepted-state matching times out. State matching remains
 * authoritative; this fallback distinguishes a finalized rollback from a slow
 * transaction and exposes the leader's error message when available.
 */
export async function leaderRollbackReason(
  hash: string
): Promise<string | undefined> {
  try {
    const tx: any = await readClient.getTransaction({ hash });
    const consensus = tx?.consensus_data ?? tx?.consensusData;
    let leader = consensus?.leader_receipt ?? consensus?.leaderReceipt;

    if (Array.isArray(leader)) {
      leader =
        leader.find(
          (receipt: any) =>
            String(receipt?.mode ?? "").toUpperCase() === "LEADER"
        ) ?? leader[0];
    }

    const result = String(
      leader?.execution_result ?? leader?.executionResult ?? ""
    ).toUpperCase();
    if (result !== "ERROR" && result !== "FINISHED_WITH_ERROR") {
      return undefined;
    }

    for (const field of [
      leader?.error,
      leader?.message,
      leader?.return_data,
      leader?.returnData,
    ]) {
      if (typeof field === "string" && field.trim()) return field.trim();
    }

    return "Contract execution rolled back.";
  } catch {
    return undefined;
  }
}

function provider() {
  if (!window.ethereum) {
    throw new Error("MetaMask was not found.");
  }
  return window.ethereum;
}

function walletCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const raw = (error as { code?: unknown }).code;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Chain onboarding WITHOUT client.connect().
 *
 * genlayer-js connect() also calls wallet_getSnaps and, when the GenLayer Snap
 * is missing, wallet_requestSnaps. The Snap is optional for this dApp: reads go
 * through the proxy and writes are ordinary eth_sendTransaction. But an
 * unguarded connect() throws -32601 on wallets without Snap support, and throws
 * 4001 if the user declines the Snap install prompt - and in both cases the
 * write never reaches MetaMask's signing dialog.
 *
 * This does the part that is actually needed (add + switch chain) and nothing else.
 */
export async function connectStudioNet(_account?: string): Promise<void> {
  const ethereum = provider();

  const currentHex = (await ethereum.request({ method: "eth_chainId" })) as string;
  const current =
    typeof currentHex === "string" ? Number.parseInt(currentHex, 16) : 0;
  if (current === STUDIONET_CHAIN_ID) return;

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: STUDIONET_CHAIN_HEX }],
    });
    return;
  } catch (error) {
    if (walletCode(error) === 4001) throw new Error("Network switch was rejected.");
    if (walletCode(error) !== 4902) throw error;
  }

  await ethereum.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: STUDIONET_CHAIN_HEX,
        chainName: (studionet as any).name ?? "GenLayer Studio Network",
        rpcUrls: [STUDIO_WALLET_RPC],
        nativeCurrency: (studionet as any).nativeCurrency ?? {
          name: "GEN Token",
          symbol: "GEN",
          decimals: 18,
        },
      },
    ],
  });

  await ethereum.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: STUDIONET_CHAIN_HEX }],
  });
}

function walletClient(account: string): any {
  provider();

  return createClient({
    chain: proxiedChain(),
    account: account as `0x${string}`,
    provider: window.ethereum as any,
  } as any);
}

export async function writeMethod(
  account: string,
  functionName: string,
  args: unknown[]
): Promise<string> {
  const client = walletClient(account);

  return (await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value: 0n,
  })) as string;
}
