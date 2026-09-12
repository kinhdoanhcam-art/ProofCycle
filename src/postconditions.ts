import type { Obligation, Period, ProofConfig, Report } from './types';

const SAT = 'COMPLIANCE_SATISFIED';
const DEF = 'COMPLIANCE_DEFICIENT';
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export function requireState(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error('Finalized postcondition failed: ' + message);
}
export function profileMatches(c: ProofConfig) {
  return c.name === 'ObligationProof' && c.version === '2.0' &&
    c.evidence_mode === 'AUTHENTICATED_ISSUER_REPORT' &&
    c.authentication === 'DESIGNATED_ISSUER_ONCHAIN_TRANSACTION' &&
    c.semantic_scope === 'ISSUER_ATTESTED_PERIOD_REQUIREMENT_SUPPORT' &&
    c.cache_scope === 'OBLIGATION_PERIOD' && c.reports_after_period_end === true &&
    c.self_submitted_text_allowed === false && c.external_truth_verified === false &&
    c.issuer_identity_verified === false && c.issuer_independence_verified === false &&
    c.max_fresh_semantic_evals_per_period === 2 && c.max_settle_batch === 20 && c.max_page_size === 50;
}
export function verifyCreated(before: ProofConfig, after: ProofConfig, ob: Obligation,
  creator: string, responsible: string, issuer: string, source: string, requirement: string,
  period: number, submission: number, remediation: number) {
  requireState(profileMatches(after), 'contract profile changed');
  requireState(after.obligation_count === before.obligation_count + 1, 'counter must increment once');
  requireState(ob.obligation_id === after.obligation_count && same(ob.creator, creator) &&
    same(ob.responsible_party, responsible) && same(ob.evidence_issuer, issuer), 'role binding');
  requireState(ob.source_name === source && ob.requirement_text === requirement &&
    ob.period_seconds === period && ob.submission_seconds === submission &&
    ob.remediation_seconds === remediation, 'immutable inputs');
  requireState(ob.settled_through === 0 && ob.satisfied_count === 0 &&
    ob.deficient_count === 0 && ob.missed_count === 0 && ob.semantic_eval_count === 0, 'new ledger');
}
export function verifyAttested(before: Report, after: Report, prior: Period, current: Period,
  obBefore: Obligation, obAfter: Obligation, issuer: string, reference: string, evidence: string,
  remediation: boolean) {
  const key = remediation ? 'remediation_report_digest' : 'initial_report_digest';
  requireState(!before.exists && before.report_digest === '' && after.exists, 'one immutable report');
  requireState(after.phase === (remediation ? 'remediation' : 'initial') &&
    after.obligation_id === obBefore.obligation_id && after.period_number === prior.period_number &&
    same(after.evidence_issuer, issuer) && same(after.responsible_party, obBefore.responsible_party) &&
    after.source_name === obBefore.source_name && after.requirement_digest === obBefore.requirement_digest &&
    after.period_start === prior.period_start && after.period_end === prior.period_end, 'period-bound provenance');
  requireState(after.record_reference === reference && after.evidence_text === evidence &&
    /^[a-f0-9]{64}$/.test(after.report_digest) && current[key] === after.report_digest &&
    after.attested_at >= prior.period_end, 'exact report body/digest and issue time');
  requireState((remediation ? after.attested_at <= prior.remediation_deadline :
    after.attested_at <= prior.submission_deadline), 'report window');
  requireState(current.initial_verdict === prior.initial_verdict &&
    current.remediation_verdict === prior.remediation_verdict &&
    obAfter.semantic_eval_count === obBefore.semantic_eval_count &&
    obAfter.settled_through === obBefore.settled_through, 'attestation cannot evaluate or settle');
}
export function verifyEvaluated(prior: Period, after: Period, beforeOb: Obligation,
  afterOb: Obligation, digest: string, remediation: boolean) {
  const verdict = remediation ? after.remediation_verdict : after.initial_verdict;
  const cache = remediation ? after.remediation_used_cache : after.initial_used_cache;
  requireState(verdict === SAT || verdict === DEF, 'semantic verdict must be explicit');
  requireState(after.obligation_id === prior.obligation_id && after.period_number === prior.period_number &&
    after.period_start === prior.period_start && after.period_end === prior.period_end, 'period identity');
  requireState((remediation ? after.remediation_report_digest : after.initial_report_digest) === digest,
    'exact pre-attested report digest');
  requireState(remediation ? prior.initial_verdict === DEF && !prior.remediation_verdict &&
    after.remediation_submitted_at > 0 && after.closed && after.initial_deficient_history &&
    after.initial_verdict === DEF && after.initial_report_digest === prior.initial_report_digest :
    !prior.initial_verdict && after.submitted_at > 0 &&
    after.closed === (verdict === SAT) && after.initial_deficient_history === (verdict === DEF),
    'phase state machine');
  requireState(after.final_outcome === (remediation ? (verdict === SAT ? SAT : DEF) :
    (verdict === SAT ? SAT : '')), 'final outcome');
  requireState(afterOb.semantic_eval_count === beforeOb.semantic_eval_count + (cache ? 0 : 1),
    'fresh evaluation count or cache hit');
  requireState(afterOb.settled_through === beforeOb.settled_through &&
    afterOb.satisfied_count === beforeOb.satisfied_count &&
    afterOb.deficient_count === beforeOb.deficient_count &&
    afterOb.missed_count === beforeOb.missed_count, 'semantic evaluation must not settle');
}
export function verifySettlement(before: Obligation, after: Obligation, rows: Period[]) {
  const count = after.settled_through - before.settled_through;
  requireState(count > 0 && count <= 20 && rows.length === count, 'ordered bounded progress');
  let sat = before.satisfied_count, def = before.deficient_count, missed = before.missed_count;
  let streak = before.streak;
  for (let i = 0; i < count; i++) {
    const p = rows[i];
    requireState(p.period_number === before.settled_through + i + 1 && p.settled && p.closed, 'ordered closed row');
    if (p.final_outcome === SAT) { sat++; streak++; }
    else if (p.final_outcome === DEF) { def++; streak = 0; }
    else if (p.final_outcome === 'MISSED') { missed++; streak = 0; }
    else requireState(false, 'valid settled outcome');
  }
  const status = def + missed >= 2 ? 'NON_COMPLIANT' : def + missed === 1 ? 'AT_RISK' : 'ACTIVE';
  requireState(after.satisfied_count === sat && after.deficient_count === def &&
    after.missed_count === missed && after.streak === streak && after.status === status &&
    after.semantic_eval_count === before.semantic_eval_count, 'deterministic ledger and status');
}
export function snapshotUnchanged(before: unknown[], after: unknown[]) {
  requireState(JSON.stringify(before) === JSON.stringify(after), 'refusal must roll back all observed state');
}
/** Time-derived view flags can change between finalized reads without any write. */
export function stableRefusalSnapshot(cfg: ProofConfig, ob: Obligation, p: Period, report: Report) {
  const { current_period: _current, latest_completed_period: _latest,
    current_period_start: _start, current_period_end: _end,
    settlement_available: _available, ...storedOb } = ob;
  const { observation_complete: _complete, submission_open: _submission,
    remediation_open: _repair, ...storedPeriod } = p;
  return [cfg, storedOb, storedPeriod, report];
}
