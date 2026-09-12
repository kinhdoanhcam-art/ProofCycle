import test from 'node:test';
import assert from 'node:assert/strict';
import { executionOutcome, executionErrorDetail } from '../src/txOutcome.ts';

const finalized = (status, execution_result, payload = null) => ({
  status: 'success',
  _transaction: {
    statusName: 'FINALIZED', result_name: 'MAJORITY_AGREE',
    consensus_data: { leader_receipt: [
      { mode: 'leader', result: { status, payload }, execution_result },
      { mode: 'validator', result: { status, payload }, execution_result },
    ] },
  },
});

test('leader rollback is an explicit refusal despite successful EVM receipt', () => {
  const receipt = finalized('rollback', 'ERROR', 'Authenticated period report is required');
  assert.equal(executionOutcome(receipt).ok, false);
  assert.equal(executionErrorDetail(receipt), 'Authenticated period report is required');
});

test('leader return is execution success', () => {
  assert.equal(executionOutcome(finalized('return', 'SUCCESS')).ok, true);
});

test('EVM receipt and consensus agreement alone are not execution proof', () => {
  assert.equal(executionOutcome({ status: 'success' }).ok, null);
  assert.equal(executionOutcome(finalized('rollback', 'SUCCESS')).ok, null);
});
