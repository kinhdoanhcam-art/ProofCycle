export type Address = `0x${string}`;
export type TxHash = `0x${string}`;
export type ComplianceVerdict = 'COMPLIANCE_SATISFIED' | 'COMPLIANCE_DEFICIENT';
export type ObligationStatus = 'ACTIVE' | 'AT_RISK' | 'NON_COMPLIANT';

export interface ProofConfig {
  name: string;
  version: string;
  semantic_verdicts: ComplianceVerdict[];
  deterministic_missed: 'MISSED';
  statuses: ObligationStatus[];
  max_requirement_length: number;
  max_evidence_length: number;
  max_settle_batch: number;
  max_fresh_semantic_evals_per_period: number;
  cache_scope: string;
  semantic_scope: string;
  external_truth_verified: boolean;
  max_page_size: number;
  obligation_count: number;
}

export interface Obligation {
  obligation_id: number;
  creator: Address;
  responsible_party: Address;
  requirement_text: string;
  period_seconds: number;
  remediation_seconds: number;
  created_at: number;
  current_period: number;
  current_period_start: number;
  current_period_end: number;
  settled_through: number;
  satisfied_count: number;
  deficient_count: number;
  missed_count: number;
  streak: number;
  semantic_eval_count: number;
  status: ObligationStatus;
  settlement_available: boolean;
}

export interface Period {
  obligation_id: number;
  period_number: number;
  period_start: number;
  period_end: number;
  evidence_text: string;
  submitted_at: number;
  initial_verdict: ComplianceVerdict | '';
  initial_used_cache: boolean;
  remediation_deadline: number;
  remediation_evidence_text: string;
  remediation_submitted_at: number;
  remediation_verdict: ComplianceVerdict | '';
  remediation_used_cache: boolean;
  closed: boolean;
  closed_at: number;
  final_outcome: ComplianceVerdict | 'MISSED' | '';
  settled: boolean;
  period_expired: boolean;
  remediation_open: boolean;
}
