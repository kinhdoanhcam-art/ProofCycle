export type Address = `0x${string}`;
export type TxHash = `0x${string}`;
export type ComplianceVerdict = 'COMPLIANCE_SATISFIED' | 'COMPLIANCE_DEFICIENT';
export type ObligationStatus = 'ACTIVE' | 'AT_RISK' | 'NON_COMPLIANT';
export interface ProofConfig {
  name: string; version: string; semantic_verdicts: ComplianceVerdict[];
  deterministic_missed: 'MISSED'; statuses: ObligationStatus[];
  evidence_mode: string; authentication: string; semantic_scope: string; cache_scope: string;
  external_truth_verified: boolean; issuer_identity_verified: boolean; issuer_independence_verified: boolean;
  reports_after_period_end: boolean; self_submitted_text_allowed: boolean;
  max_fresh_semantic_evals_per_period: number; max_requirement_length: number;
  max_evidence_length: number; max_page_size: number; max_settle_batch: number; obligation_count: number;
}
export interface Obligation {
  obligation_id: number; creator: Address; responsible_party: Address; evidence_issuer: Address;
  source_name: string; requirement_text: string; requirement_digest: string;
  period_seconds: number; submission_seconds: number; remediation_seconds: number;
  created_at: number; current_period: number; latest_completed_period: number;
  current_period_start: number; current_period_end: number;
  settled_through: number; satisfied_count: number; deficient_count: number; missed_count: number;
  streak: number; semantic_eval_count: number; status: ObligationStatus; settlement_available: boolean;
}
export interface Period {
  obligation_id: number; period_number: number; period_start: number; period_end: number;
  submission_deadline: number; remediation_deadline: number;
  initial_report_digest: string; remediation_report_digest: string;
  submitted_at: number; initial_verdict: ComplianceVerdict | ''; initial_used_cache: boolean;
  initial_deficient_history: boolean; remediation_submitted_at: number;
  remediation_verdict: ComplianceVerdict | ''; remediation_used_cache: boolean;
  closed: boolean; closed_at: number; final_outcome: ComplianceVerdict | 'MISSED' | '';
  settled: boolean; observation_complete: boolean; submission_open: boolean; remediation_open: boolean;
}
export interface Report {
  exists: boolean; obligation_id: number; period_number: number; phase: 'initial' | 'remediation';
  evidence_issuer: Address; responsible_party: Address; source_name: string; requirement_digest: string;
  period_start: number; period_end: number; record_reference: string;
  evidence_text: string; report_digest: string; attested_at: number;
}
