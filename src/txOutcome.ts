function leaderResult(receipt: any) {
  const transaction = receipt?._transaction ?? receipt;
  const entries = transaction?.consensus_data?.leader_receipt;
  return Array.isArray(entries) ? entries.find((entry: any) => entry?.mode === 'leader') : undefined;
}

// An EVM receipt marked success only proves admission to consensus. The
// finalized GenVM leader result distinguishes a contract return from rollback.
export function executionOutcome(receipt: any) {
  for (const source of [receipt, receipt?._transaction]) {
    const name = String(source?.txExecutionResultName || source?.executionResultName || '').toUpperCase();
    if (name === 'FINISHED_WITH_RETURN') return { ok: true as const, name };
    if (name === 'FINISHED_WITH_ERROR') return { ok: false as const, name };
  }
  const leader = leaderResult(receipt);
  if (leader?.result?.status === 'rollback' && leader.execution_result === 'ERROR')
    return { ok: false as const, name: 'ROLLBACK' };
  if (leader?.result?.status === 'return' && leader.execution_result === 'SUCCESS')
    return { ok: true as const, name: 'RETURN' };
  return { ok: null, name: 'EXECUTION_RESULT_UNAVAILABLE' };
}

export function executionErrorDetail(receipt: unknown, fallback = 'Contract execution failed.') {
  const payload = leaderResult(receipt)?.result?.payload;
  if (typeof payload === 'string' && payload.trim()) return payload.trim();
  return fallback;
}
