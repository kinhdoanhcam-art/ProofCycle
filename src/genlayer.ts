import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { ExecutionResult, TransactionStatus } from 'genlayer-js/types';
import { CONTRACT_ADDRESS, EXPLORER_BASE, CONFIG_OVERRIDE_MISMATCH } from './config';
import type { Address, Obligation, Period, ProofConfig, Report, TxHash } from './types';

const readClient = createClient({ chain: studionet }) as any;
export const STUDIONET_CHAIN_ID_HEX = `0x${studionet.id.toString(16)}`;
export function walletProvider(): any { return typeof window === 'undefined' ? null : window.ethereum; }
export async function connectWallet(): Promise<Address> {
  const provider = walletProvider();
  if (!provider) throw new Error('Enable a browser wallet first.');
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  if (!accounts?.[0]) throw new Error('No wallet account was returned.');
  return accounts[0] as Address;
}
async function ensureStudioNet(account: Address) {
  if (CONFIG_OVERRIDE_MISMATCH) throw new Error('Stale VITE_CONTRACT_ADDRESS override; remove it and rebuild.');
  const provider = walletProvider();
  if (!provider) throw new Error('Enable a browser wallet first.');
  const current = String(await provider.request({ method: 'eth_chainId' }));
  if (current.toLowerCase() !== STUDIONET_CHAIN_ID_HEX.toLowerCase()) {
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: STUDIONET_CHAIN_ID_HEX }] });
    } catch (error: any) {
      if (error?.code !== 4902) throw error;
      await provider.request({ method: 'wallet_addEthereumChain', params: [{
        chainId: STUDIONET_CHAIN_ID_HEX, chainName: studionet.name,
        rpcUrls: studionet.rpcUrls.default.http, nativeCurrency: studionet.nativeCurrency,
        blockExplorerUrls: [studionet.blockExplorers?.default?.url].filter(Boolean),
      }] });
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: STUDIONET_CHAIN_ID_HEX }] });
    }
  }
  const selected = String((await provider.request({ method: 'eth_accounts' }) as string[])?.[0] || '');
  const chain = String(await provider.request({ method: 'eth_chainId' }));
  if (selected.toLowerCase() !== account.toLowerCase()) throw new Error('Selected wallet changed; reconnect before sending.');
  if (chain.toLowerCase() !== STUDIONET_CHAIN_ID_HEX.toLowerCase()) throw new Error('Wallet is not on StudioNet.');
  return createClient({ chain: studionet, account, provider }) as any;
}
async function readFinal<T>(functionName: string, args: unknown[] = []): Promise<T> {
  return readClient.readContract({ address: CONTRACT_ADDRESS, functionName, args, stateStatus: 'finalized' }) as Promise<T>;
}
export const getConfig = () => readFinal<ProofConfig>('get_config');
export const getObligation = (id: number) => readFinal<Obligation>('get_obligation', [id]);
export const getPeriod = (id: number, period: number) => readFinal<Period>('get_period', [id, period]);
export const getPeriods = (id: number, from: number, count: number) => readFinal<Period[]>('get_periods', [id, from, count]);
export const getReport = (id: number, period: number, remediation: boolean) => readFinal<Report>('get_report', [id, period, remediation]);
export async function writeMethod(account: Address, functionName: string, args: unknown[]): Promise<TxHash> {
  const client = await ensureStudioNet(account);
  return client.writeContract({ address: CONTRACT_ADDRESS, functionName, args, value: 0n });
}

function executionName(value: any) {
  return String(value?.txExecutionResultName || value?.executionResultName || value?.transaction?.txExecutionResultName || value?.transaction?.executionResultName || '').toUpperCase();
}

export function executionOutcome(receipt: any) {
  for (const source of [receipt, receipt?._transaction]) {
    const name = executionName(source);
    if (name === ExecutionResult.FINISHED_WITH_RETURN || name === 'FINISHED_WITH_RETURN') return { ok: true as const, name: 'FINISHED_WITH_RETURN' };
    if (name === ExecutionResult.FINISHED_WITH_ERROR || name === 'FINISHED_WITH_ERROR') return { ok: false as const, name: 'FINISHED_WITH_ERROR' };
  }
  return { ok: null, name: 'EXECUTION_RESULT_UNAVAILABLE' };
}

export async function waitFinalized(txHash: TxHash) {
  const receipt = await readClient.waitForTransactionReceipt({ hash: txHash, status: TransactionStatus.FINALIZED, interval: 5000, retries: 240, fullTransaction: true });
  if (executionOutcome(receipt).ok !== null) return receipt;
  try {
    const transaction = await readClient.getTransaction({ hash: txHash });
    return { ...receipt, _transaction: transaction };
  } catch { return receipt; }
}

function deepStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => deepStrings(item, output));
  else if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach((item) => deepStrings(item, output));
  return output;
}

export function executionErrorDetail(receipt: unknown, fallback = 'Contract execution failed.') {
  const strings = deepStrings(receipt).map((value) => value.trim()).filter(Boolean);
  const preferred = strings.find((value) => /only the responsible|creator and responsible|period|remediation|evidence|semantic evaluation|invalid|cannot|too long|empty|deadline|already|error|rollback|usererror/i.test(value));
  return preferred || fallback;
}

export function txExplorerUrl(hash: string) { return `${EXPLORER_BASE}/tx/${hash}`; }
export function cleanError(error: unknown) {
  const e = error as any;
  return String(e?.shortMessage || e?.message || e || 'Unknown error').replace(/^Error:\s*/i, '').replace(/\n\s*Details:[\s\S]*$/i, '').trim();
}
