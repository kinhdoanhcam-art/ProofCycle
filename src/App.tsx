import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  cleanError, connectWallet, createObligationTx, executionErrorDetail, executionOutcome,
  getConfig, getObligation, getPeriod, getPeriods, remediatePeriodTx, settlePeriodsTx,
  submitEvidenceTx, txExplorerUrl, waitFinalized,
} from './genlayer';
import {
  CONTRACT_ADDRESS, CONTRACT_EXPLORER_URL, EXPECTED_CONTRACT_VERSION,
  RUNTIME_EVIDENCE_ADDRESS, RUNTIME_EXPLORER_URL, SOURCE_SHA256,
} from './config';
import type { Address, Obligation, Period, ProofConfig, TxHash } from './types';

type Page = 'cycle' | 'new' | 'obligation' | 'evidence' | 'repair' | 'settle' | 'proof';

const nav: { key: Page; code: string; label: string }[] = [
  { key: 'cycle', code: '00', label: 'Cycle' },
  { key: 'new', code: '01', label: 'Create' },
  { key: 'obligation', code: '02', label: 'Obligation' },
  { key: 'evidence', code: '03', label: 'Evidence' },
  { key: 'repair', code: '04', label: 'Remediation' },
  { key: 'settle', code: '05', label: 'Settlement' },
  { key: 'proof', code: '06', label: 'Proof' },
];

function short(v?: string, left = 7, right = 5) {
  if (!v) return '—';
  return v.length <= left + right + 3 ? v : `${v.slice(0, left)}…${v.slice(-right)}`;
}
function eq(a?: string, b?: string) { return String(a || '').toLowerCase() === String(b || '').toLowerCase(); }
function asPositiveInt(v: string) { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : 0; }
function copy(v: string) { navigator.clipboard?.writeText(v).catch(() => undefined); }
function when(unix: number) { if (!unix) return '—'; try { return new Date(unix * 1000).toLocaleString(); } catch { return String(unix); } }
function verdictTone(v?: string) { return v === 'COMPLIANCE_SATISFIED' ? 'good' : v === 'COMPLIANCE_DEFICIENT' || v === 'MISSED' ? 'bad' : 'neutral'; }
function statusTone(v?: string) { return v === 'ACTIVE' ? 'good' : v === 'AT_RISK' ? 'warn' : v === 'NON_COMPLIANT' ? 'bad' : 'neutral'; }

function Logo({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'compact' : ''}`}>
    <img src="/logo.svg" alt="ProofCycle" />
    {!compact && <div><strong>ProofCycle</strong><span>evidence → settlement → status</span></div>}
  </div>;
}
function Kicker({ children }: { children: ReactNode }) { return <div className="kicker">{children}</div>; }
function Pill({ children, kind = 'neutral' }: { children: ReactNode; kind?: string }) { return <span className={`pill ${kind}`}>{children}</span>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty"><div className="empty-ring"><i/><i/><i/></div><h3>{title}</h3><p>{text}</p></div>; }

export default function App() {
  const [page, setPage] = useState<Page>(() => (location.hash.replace('#/', '') as Page) || 'cycle');
  const [config, setConfig] = useState<ProofConfig | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [obligationId, setObligationId] = useState(0);
  const [obligation, setObligation] = useState<Obligation | null>(null);
  const [currentPeriod, setCurrentPeriod] = useState<Period | null>(null);
  const [history, setHistory] = useState<Period[]>([]);
  const [repairPeriod, setRepairPeriod] = useState<Period | null>(null);
  const [repairPeriodNumber, setRepairPeriodNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState<TxHash | null>(null);

  const [openObligationId, setOpenObligationId] = useState('');
  const [responsible, setResponsible] = useState('');
  const [requirement, setRequirement] = useState('');
  const [periodSeconds, setPeriodSeconds] = useState('600');
  const [remediationSeconds, setRemediationSeconds] = useState('300');
  const [evidence, setEvidence] = useState('');
  const [remediationEvidence, setRemediationEvidence] = useState('');

  const profileMatched = Boolean(
    config && config.name === 'ObligationProof' && config.version === EXPECTED_CONTRACT_VERSION &&
    config.cache_scope === 'OBLIGATION' && config.semantic_scope === 'TEXTUAL_EVIDENCE_SUPPORT' &&
    config.max_fresh_semantic_evals_per_period === 2 && config.external_truth_verified === false
  );
  const isResponsible = Boolean(account && obligation && eq(account, obligation.responsible_party));
  const failures = (obligation?.deficient_count || 0) + (obligation?.missed_count || 0);
  const progress = useMemo(() => {
    if (!obligation) return 0;
    const total = obligation.satisfied_count + failures;
    return total ? Math.round((obligation.satisfied_count / total) * 100) : 0;
  }, [obligation, failures]);

  function go(next: Page) { location.hash = `#/${next}`; setPage(next); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  useEffect(() => {
    const onHash = () => setPage((location.hash.replace('#/', '') as Page) || 'cycle');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { refreshConfig(); }, []);

  async function refreshConfig() {
    try { setConfig(await getConfig()); } catch (e) { setError(cleanError(e)); }
  }
  async function connect() {
    setError('');
    try {
      const a = await connectWallet(); setAccount(a); setNotice(`Wallet connected: ${short(a, 9, 6)}`);
    } catch (e) { setError(cleanError(e)); }
  }
  async function loadObligation(id = obligationId) {
    if (!id) throw new Error('Enter a valid obligation ID.');
    const ob = await getObligation(id);
    const period = await getPeriod(id, ob.current_period);
    setObligationId(id); setOpenObligationId(String(id)); setObligation(ob); setCurrentPeriod(period);
    setRepairPeriodNumber(String(ob.current_period)); setRepairPeriod(period);
    setNotice(`Obligation #${id} loaded from finalized state.`);
    return ob;
  }
  async function refreshLoaded() {
    if (!obligationId) return;
    await loadObligation(obligationId);
    if (history.length) await loadHistory(obligationId);
  }
  async function loadHistory(id = obligationId) {
    if (!id) throw new Error('Open an obligation first.');
    const ob = obligation?.obligation_id === id ? obligation : await getObligation(id);
    const rows = await getPeriods(id, 1, Math.min(50, Math.max(1, ob.current_period)));
    setHistory(rows); return rows;
  }
  async function loadRepairPeriod() {
    if (!obligationId) throw new Error('Open an obligation first.');
    const p = asPositiveInt(repairPeriodNumber); if (!p) throw new Error('Enter a valid period number.');
    const row = await getPeriod(obligationId, p); setRepairPeriod(row); return row;
  }

  async function runWrite(label: string, submit: () => Promise<TxHash>, verify: () => Promise<void>) {
    setBusy(true); setError(''); setTxHash(null); setNotice(`${label}: requesting wallet signature…`);
    try {
      const hash = await submit(); setTxHash(hash); setNotice(`${label}: submitted ${short(hash, 10, 8)} · waiting for finalization…`);
      const receipt = await waitFinalized(hash); const outcome = executionOutcome(receipt);
      if (outcome.ok === false) throw new Error(executionErrorDetail(receipt));
      await verify();
      setNotice(outcome.ok === true ? `${label}: execution and finalized postcondition verified.` : `${label}: finalized postcondition verified (execution enum unavailable from SDK).`);
    } catch (e) { setError(cleanError(e)); }
    finally { setBusy(false); }
  }

  async function createObligation() {
    if (!account) return setError('Connect a wallet first.');
    const cleanRequirement = requirement.trim();
    const p = asPositiveInt(periodSeconds); const r = asPositiveInt(remediationSeconds);
    if (!responsible) return setError('Enter the responsible-party address.');
    if (!cleanRequirement) return setError('Requirement text cannot be empty.');
    if (!p || !r || r >= p) return setError('Use positive timing values with remediation shorter than the period.');
    const before = config || await getConfig();
    await runWrite('Create obligation', () => createObligationTx(account, responsible, cleanRequirement, p, r), async () => {
      const cfg = await getConfig();
      if (cfg.obligation_count !== before.obligation_count + 1) throw new Error('Finalized obligation counter did not increment exactly once.');
      const ob = await getObligation(cfg.obligation_count);
      if (!eq(ob.creator, account) || !eq(ob.responsible_party, responsible) || ob.requirement_text !== cleanRequirement || ob.period_seconds !== p || ob.remediation_seconds !== r || ob.settled_through !== 0) throw new Error('Finalized obligation postcondition mismatch.');
      setConfig(cfg); setObligationId(ob.obligation_id); setOpenObligationId(String(ob.obligation_id)); setObligation(ob);
      const row = await getPeriod(ob.obligation_id, ob.current_period); setCurrentPeriod(row); setRepairPeriod(row); setRepairPeriodNumber(String(ob.current_period));
      setRequirement(''); setResponsible(''); go('obligation');
    });
  }

  async function submitEvidence() {
    if (!account || !obligation) return setError('Connect a wallet and open an obligation first.');
    if (!isResponsible) return setError('Only the responsible party may submit evidence.');
    const clean = evidence.trim(); if (!clean) return setError('Evidence text cannot be empty.');
    const before = await getObligation(obligation.obligation_id);
    const periodNo = before.current_period;
    const counters = [before.satisfied_count, before.deficient_count, before.missed_count, before.settled_through];
    await runWrite('Submit evidence', () => submitEvidenceTx(account, before.obligation_id, clean), async () => {
      const row = await getPeriod(before.obligation_id, periodNo); const after = await getObligation(before.obligation_id);
      if (row.evidence_text !== clean || !['COMPLIANCE_SATISFIED', 'COMPLIANCE_DEFICIENT'].includes(row.initial_verdict)) throw new Error('Finalized evidence record mismatch.');
      if ([after.satisfied_count, after.deficient_count, after.missed_count, after.settled_through].some((v, i) => v !== counters[i])) throw new Error('Aggregate counters changed before ordered settlement.');
      const expectedEval = row.initial_used_cache ? before.semantic_eval_count : before.semantic_eval_count + 1;
      if (after.semantic_eval_count !== expectedEval) throw new Error('Semantic evaluation counter does not match cache usage.');
      if (row.initial_verdict === 'COMPLIANCE_SATISFIED' && !row.closed) throw new Error('Satisfied period did not close.');
      if (row.initial_verdict === 'COMPLIANCE_DEFICIENT' && row.closed) throw new Error('Deficient period closed before remediation/expiry.');
      setObligation(after); setCurrentPeriod(row); setEvidence(''); setRepairPeriod(row); setRepairPeriodNumber(String(periodNo));
    });
  }

  async function remediate() {
    if (!account || !obligation || !repairPeriod) return setError('Connect a wallet and load a period first.');
    if (!isResponsible) return setError('Only the responsible party may remediate.');
    const clean = remediationEvidence.trim(); if (!clean) return setError('Remediation evidence cannot be empty.');
    if (repairPeriod.initial_verdict !== 'COMPLIANCE_DEFICIENT' || !repairPeriod.remediation_open) return setError('This period is not open for remediation.');
    const before = await getObligation(obligation.obligation_id);
    const counters = [before.satisfied_count, before.deficient_count, before.missed_count, before.settled_through];
    await runWrite('Remediate period', () => remediatePeriodTx(account, obligation.obligation_id, repairPeriod.period_number, clean), async () => {
      const row = await getPeriod(obligation.obligation_id, repairPeriod.period_number); const after = await getObligation(obligation.obligation_id);
      if (row.remediation_evidence_text !== clean || !row.closed || !['COMPLIANCE_SATISFIED', 'COMPLIANCE_DEFICIENT'].includes(row.remediation_verdict)) throw new Error('Finalized remediation record mismatch.');
      if ([after.satisfied_count, after.deficient_count, after.missed_count, after.settled_through].some((v, i) => v !== counters[i])) throw new Error('Aggregate counters changed before ordered settlement.');
      const expectedEval = row.remediation_used_cache ? before.semantic_eval_count : before.semantic_eval_count + 1;
      if (after.semantic_eval_count !== expectedEval) throw new Error('Semantic evaluation counter does not match remediation cache usage.');
      setObligation(after); setRepairPeriod(row); if (row.period_number === after.current_period) setCurrentPeriod(row); setRemediationEvidence('');
    });
  }

  async function settle() {
    if (!account || !obligation) return setError('Connect a wallet and open an obligation first.');
    const before = await getObligation(obligation.obligation_id);
    if (!before.settlement_available) return setError('No ordered settlement is currently available.');
    await runWrite('Settle periods', () => settlePeriodsTx(account, obligation.obligation_id), async () => {
      const after = await getObligation(obligation.obligation_id);
      if (after.settled_through <= before.settled_through) throw new Error('Finalized settlement cursor did not advance.');
      if (after.satisfied_count < before.satisfied_count || after.deficient_count < before.deficient_count || after.missed_count < before.missed_count) throw new Error('Finalized aggregate counters regressed.');
      setObligation(after); const row = await getPeriod(after.obligation_id, after.current_period); setCurrentPeriod(row); await loadHistory(after.obligation_id);
    });
  }

  return <div className="app-shell">
    <header className="topbar">
      <Logo />
      <nav>{nav.map(item => <button key={item.key} className={page === item.key ? 'active' : ''} onClick={() => go(item.key)}><b>{item.code}</b>{item.label}</button>)}</nav>
      <div className="head-actions">
        <a className="contract-chip" href={CONTRACT_EXPLORER_URL} target="_blank" rel="noreferrer"><i/>{short(CONTRACT_ADDRESS, 8, 6)}</a>
        <button className="wallet" onClick={connect}>{account ? short(account, 8, 6) : 'Connect wallet'}</button>
      </div>
    </header>

    <div className="signal-line"><b>SIGNAL</b><span>{notice || (account ? `Wallet connected: ${short(account, 9, 6)}` : 'Reads use finalized contract state.')}</span></div>
    {error && <div className="error-bar"><b>ERROR</b><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
    {txHash && <div className="tx-bar"><span>Transaction</span><a href={txExplorerUrl(txHash)} target="_blank" rel="noreferrer">{short(txHash, 12, 10)} ↗</a></div>}

    <main>
      {page === 'cycle' && <section className="page hero-page">
        <div className="hero-copy"><Kicker>RECURRING COMPLIANCE / ON-CHAIN SETTLEMENT</Kicker><h1>Evidence arrives.<br/><em>Status follows.</em></h1><p>ProofCycle turns recurring textual evidence into an auditable period ledger. Semantic classification stays narrow; timing, remediation, settlement, counters, and status remain deterministic.</p><div className="hero-actions"><button className="primary" onClick={() => go('new')}>Create an obligation →</button><button onClick={() => go('obligation')}>Inspect finalized state</button></div></div>
        <div className="cycle-visual"><div className="orbit orbit-a"/><div className="orbit orbit-b"/><div className="cycle-core"><span>PROOF</span><strong>→</strong><span>SETTLE</span></div><div className="node n1"><b>01</b><span>EVIDENCE</span></div><div className="node n2"><b>02</b><span>REMEDIATION</span></div><div className="node n3"><b>03</b><span>STATUS</span></div></div>
        <div className="metric-strip"><Metric label="OBLIGATIONS" value={String(config?.obligation_count ?? '—')} note="finalized count"/><Metric label="CACHE" value={config?.cache_scope || '—'} note="isolation scope"/><Metric label="FRESH EVALS" value={config ? `${config.max_fresh_semantic_evals_per_period} / period` : '—'} note="initial + remediation"/><Metric label="TRUTH SCOPE" value="TEXT ONLY" note="no external verification"/></div>
        <div className="rule-grid"><Rule n="01" title="One requirement, many periods" text="Requirement text is immutable for the life of the obligation."/><Rule n="02" title="Classification is narrow" text="Validators assess whether submitted text supports every mandatory requirement."/><Rule n="03" title="Counters settle in order" text="Semantic verdicts do not mutate aggregate compliance counters before settlement."/></div>
      </section>}

      {page === 'new' && <section className="page"><PageHead code="01 / CREATE" title="Define the recurring obligation." text="Separate creator and responsible party. Lock the requirement and the cadence before the first evidence period begins." side={<ProfileBadge matched={profileMatched}/>}/><div className="form-frame"><div className="form-index">OBL<br/><b>/01</b></div><div className="form-body"><label>RESPONSIBLE PARTY<input value={responsible} onChange={e => setResponsible(e.target.value)} placeholder="0x…"/></label><label>IMMUTABLE REQUIREMENT<textarea value={requirement} onChange={e => setRequirement(e.target.value)} maxLength={config?.max_requirement_length || 2000} placeholder="Describe every mandatory condition evidence must support."/><span>{requirement.length} / {config?.max_requirement_length || 2000}</span></label><div className="timing-row"><label>PERIOD SECONDS<input value={periodSeconds} onChange={e => setPeriodSeconds(e.target.value)}/></label><label>REMEDIATION SECONDS<input value={remediationSeconds} onChange={e => setRemediationSeconds(e.target.value)}/></label></div><div className="write-foot"><small>Creator: {account ? short(account, 10, 8) : 'connect wallet'}</small><button className="primary" disabled={busy || !account || !responsible || !requirement.trim()} onClick={createObligation}>Create obligation →</button></div></div></div></section>}

      {page === 'obligation' && <section className="page"><PageHead code="02 / OBLIGATION" title="Read the compliance state." text="Open any obligation ID. This screen uses finalized state and derives no evidence from browser memory." side={<div className="open-box"><input value={openObligationId} onChange={e => setOpenObligationId(e.target.value)} placeholder="Obligation ID"/><button onClick={() => loadObligation(asPositiveInt(openObligationId)).catch(e => setError(cleanError(e)))}>Open</button></div>}/>{obligation ? <ObligationBoard obligation={obligation} period={currentPeriod} progress={progress} account={account} onRefresh={() => refreshLoaded().catch(e => setError(cleanError(e)))} onEvidence={() => go('evidence')} onSettle={() => go('settle')}/> : <Empty title="No obligation loaded" text="Enter an obligation ID to inspect the immutable requirement, live period, counters, and derived status."/>}</section>}

      {page === 'evidence' && <section className="page"><PageHead code="03 / PERIOD EVIDENCE" title="Support every mandatory condition." text="The model judges only textual support against the immutable requirement. It does not verify external truth, timing, or contract consequences." side={<RoleBadge obligation={obligation} account={account}/>}/>{obligation && currentPeriod ? <div className="evidence-layout"><article className="requirement-card"><Kicker>IMMUTABLE REQUIREMENT</Kicker><p>{obligation.requirement_text}</p><div className="period-window"><span>PERIOD #{obligation.current_period}</span><b>{when(obligation.current_period_start)}</b><i>→</i><b>{when(obligation.current_period_end)}</b></div></article><div className="evidence-form"><label>EVIDENCE TEXT<textarea value={evidence} onChange={e => setEvidence(e.target.value)} maxLength={config?.max_evidence_length || 4000} placeholder="Submit textual evidence for the current reporting period." disabled={Boolean(currentPeriod.evidence_text)}/><span>{evidence.length} / {config?.max_evidence_length || 4000}</span></label>{currentPeriod.evidence_text ? <PeriodResult period={currentPeriod}/> : <button className="primary" disabled={busy || !isResponsible || !evidence.trim()} onClick={submitEvidence}>Submit current-period evidence →</button>}<small>{isResponsible ? 'Write permission: responsible-party wallet' : 'Connect the responsible-party wallet to submit.'}</small></div></div> : <Empty title="Open an obligation first" text="Evidence submission is always scoped to the current finalized period of one obligation."/>}</section>}

      {page === 'repair' && <section className="page"><PageHead code="04 / REMEDIATION" title="One repair window. One final outcome." text="Only a deficient, still-open period may be remediated. Exact evidence reuse consumes the obligation-scoped cache instead of rerolling semantics." side={<div className="open-box"><input value={repairPeriodNumber} onChange={e => setRepairPeriodNumber(e.target.value)} placeholder="Period"/><button onClick={() => loadRepairPeriod().catch(e => setError(cleanError(e)))}>Load</button></div>}/>{obligation && repairPeriod ? <div className="repair-grid"><article className="period-dossier"><div className="dossier-head"><span>PERIOD #{repairPeriod.period_number}</span><Pill kind={verdictTone(repairPeriod.initial_verdict)}>{repairPeriod.initial_verdict || 'NO EVIDENCE'}</Pill></div><p>{repairPeriod.evidence_text || 'No initial evidence recorded.'}</p><dl><dt>Initial cache</dt><dd>{repairPeriod.initial_used_cache ? 'HIT' : 'FRESH'}</dd><dt>Remediation deadline</dt><dd>{when(repairPeriod.remediation_deadline)}</dd><dt>Closed</dt><dd>{repairPeriod.closed ? 'YES' : 'NO'}</dd><dt>Final outcome</dt><dd>{repairPeriod.final_outcome || 'PENDING'}</dd></dl></article><div className="evidence-form"><label>REMEDIATION EVIDENCE<textarea value={remediationEvidence} onChange={e => setRemediationEvidence(e.target.value)} maxLength={config?.max_evidence_length || 4000} placeholder="Submit the one allowed remediation attempt." disabled={!repairPeriod.remediation_open}/><span>{remediationEvidence.length} / {config?.max_evidence_length || 4000}</span></label><button className="primary" disabled={busy || !isResponsible || !repairPeriod.remediation_open || !remediationEvidence.trim()} onClick={remediate}>Submit remediation →</button><small>{repairPeriod.remediation_open ? 'At the deadline equality, remediation remains allowed.' : 'This period is not open for remediation.'}</small>{repairPeriod.remediation_evidence_text && <div className="cache-note"><b>{repairPeriod.remediation_used_cache ? 'CACHE HIT' : 'FRESH SEMANTIC CALL'}</b><span>{repairPeriod.remediation_verdict}</span></div>}</div></div> : <Empty title="Open an obligation and period" text="Load a deficient period to inspect its remediation deadline and one-attempt repair path."/>}</section>}

      {page === 'settle' && <section className="page"><PageHead code="05 / ORDERED SETTLEMENT" title="Verdicts become compliance state here." text="Settlement is permissionless and ordered. Counters, streak, and derived status change only as the settlement cursor advances." side={obligation ? <Pill kind={statusTone(obligation.status)}>{obligation.status}</Pill> : null}/>{obligation ? <><div className="settle-board"><div className="status-dial"><span>STATUS</span><strong>{obligation.status}</strong><small>{failures} settled failure{failures === 1 ? '' : 's'}</small></div><div className="counter-bank"><Counter label="SATISFIED" value={obligation.satisfied_count}/><Counter label="DEFICIENT" value={obligation.deficient_count}/><Counter label="MISSED" value={obligation.missed_count}/><Counter label="STREAK" value={obligation.streak}/><Counter label="SETTLED THROUGH" value={obligation.settled_through}/><Counter label="SEMANTIC EVALS" value={obligation.semantic_eval_count}/></div><div className="settle-action"><Kicker>SETTLEMENT AVAILABILITY</Kicker><strong>{obligation.settlement_available ? 'READY' : 'NOT READY'}</strong><p>{obligation.settlement_available ? 'At least the next ordered period can be finalized into aggregate state.' : 'The next ordered period has not reached a deterministic final outcome yet.'}</p><button className="primary" disabled={busy || !account || !obligation.settlement_available} onClick={settle}>Settle available periods →</button><small>Any connected wallet may settle.</small></div></div><div className="history-head"><div><Kicker>PERIOD LEDGER</Kicker><h2>Finalized period history</h2></div><button onClick={() => loadHistory().catch(e => setError(cleanError(e)))}>Load history</button></div>{history.length ? <div className="period-table"><div className="period-row header"><span>#</span><span>INITIAL</span><span>REMEDIATION</span><span>FINAL</span><span>CACHE</span><span>SETTLED</span></div>{history.map(row => <div className="period-row" key={row.period_number}><span>#{row.period_number}</span><span><Pill kind={verdictTone(row.initial_verdict)}>{row.initial_verdict || 'EMPTY'}</Pill></span><span>{row.remediation_verdict || '—'}</span><span><Pill kind={verdictTone(row.final_outcome)}>{row.final_outcome || 'OPEN'}</Pill></span><span>{row.initial_used_cache || row.remediation_used_cache ? 'HIT' : row.evidence_text ? 'FRESH' : '—'}</span><span>{row.settled ? 'YES' : 'NO'}</span></div>)}</div> : <Empty title="History not loaded" text="Load finalized periods to inspect evidence, cache usage, final outcomes, and settlement state."/>}</> : <Empty title="Open an obligation first" text="Settlement state belongs to one obligation and advances strictly in period order."/>}</section>}

      {page === 'proof' && <section className="page"><PageHead code="06 / VERIFICATION" title="Frozen source. Separate runtime proof." text="The clean Project address starts empty. Load-bearing behavioral checks were executed on a separate deployment of the exact frozen source." side={<ProfileBadge matched={profileMatched}/>}/><div className="proof-grid"><ProofCard label="PROJECT CONTRACT" value={CONTRACT_ADDRESS} href={CONTRACT_EXPLORER_URL} note="Frontend target. Fresh deployment intended to begin with zero obligations."/><ProofCard label="RUNTIME EVIDENCE" value={RUNTIME_EVIDENCE_ADDRESS} href={RUNTIME_EXPLORER_URL} note="Separate StudioNet deployment used for finalized runtime verification."/><div className="hash-card"><div><Kicker>FROZEN SOURCE SHA256</Kicker><code>{SOURCE_SHA256}</code></div><button onClick={() => copy(SOURCE_SHA256)}>Copy hash</button></div></div><div className="proof-list"><ProofRow n="01" title="Deficient evidence isolation" text="A deficient semantic verdict was stored while aggregate counters remained unchanged before settlement."/><ProofRow n="02" title="Remediation reroll prevention" text="Exact remediation evidence reused the cached verdict and semantic_eval_count stayed unchanged."/><ProofRow n="03" title="Ordered settlement" text="Settling period #1 advanced settled_through and produced deficient_count=1 with AT_RISK status."/><ProofRow n="04" title="Cross-period cache reuse" text="The same evidence in period #2 returned initial_used_cache=true without another fresh semantic evaluation."/><ProofRow n="05" title="Second remediation cache hit" text="Period #2 remediation reused the same obligation-scoped verdict and closed deficient."/><ProofRow n="06" title="Deterministic escalation" text="After period #2 settled, deficient_count=2 and status became NON_COMPLIANT."/></div></section>}
    </main>

    <footer><Logo compact/><span>ProofCycle · ObligationProof v{config?.version || EXPECTED_CONTRACT_VERSION}</span><span>Semantic scope: textual evidence support. Consequences settle deterministically.</span><a href={CONTRACT_EXPLORER_URL} target="_blank" rel="noreferrer">StudioNet ↗</a></footer>
  </div>;
}

function PageHead({ code, title, text, side }: { code: string; title: string; text: string; side?: ReactNode }) { return <div className="page-head"><div><Kicker>{code}</Kicker><h1>{title}</h1><p>{text}</p></div>{side && <div>{side}</div>}</div>; }
function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>; }
function Rule({ n, title, text }: { n: string; title: string; text: string }) { return <article><b>RULE {n}</b><h3>{title}</h3><p>{text}</p></article>; }
function ProfileBadge({ matched }: { matched: boolean }) { return <div className={`profile-badge ${matched ? 'ok' : 'bad'}`}><i/>{matched ? 'LIVE PROFILE MATCHED' : 'PROFILE MISMATCH'}</div>; }
function RoleBadge({ obligation, account }: { obligation: Obligation | null; account: Address | null }) { const role = obligation && account && eq(obligation.responsible_party, account) ? 'RESPONSIBLE PARTY' : obligation && account && eq(obligation.creator, account) ? 'CREATOR' : 'OBSERVER'; return <div className="role-badge"><small>CONNECTED ROLE</small><strong>{role}</strong></div>; }
function Counter({ label, value }: { label: string; value: number }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function PeriodResult({ period }: { period: Period }) { return <div className="period-result"><div><Kicker>FINALIZED INITIAL VERDICT</Kicker><Pill kind={verdictTone(period.initial_verdict)}>{period.initial_verdict}</Pill></div><dl><dt>Cache</dt><dd>{period.initial_used_cache ? 'HIT' : 'FRESH'}</dd><dt>Closed</dt><dd>{period.closed ? 'YES' : 'NO'}</dd><dt>Remediation</dt><dd>{period.remediation_open ? 'OPEN' : 'CLOSED'}</dd><dt>Final outcome</dt><dd>{period.final_outcome || 'PENDING'}</dd></dl></div>; }
function ObligationBoard({ obligation, period, progress, account, onRefresh, onEvidence, onSettle }: { obligation: Obligation; period: Period | null; progress: number; account: Address | null; onRefresh: () => void; onEvidence: () => void; onSettle: () => void }) { return <div className="obligation-board"><div className="ob-top"><div><Pill kind={statusTone(obligation.status)}>{obligation.status}</Pill><span>obligation #{obligation.obligation_id}</span></div><button onClick={onRefresh}>Refresh finalized state</button></div><div className="ob-main"><article className="requirement-panel"><Kicker>IMMUTABLE REQUIREMENT</Kicker><h2>Recurring proof target</h2><p>{obligation.requirement_text}</p><div className="party-lines"><div><span>CREATOR</span><code>{obligation.creator}</code>{account && eq(account, obligation.creator) && <Pill kind="blue">YOU</Pill>}</div><div><span>RESPONSIBLE</span><code>{obligation.responsible_party}</code>{account && eq(account, obligation.responsible_party) && <Pill kind="blue">YOU</Pill>}</div></div></article><aside className="period-panel"><span>CURRENT PERIOD</span><strong>#{obligation.current_period}</strong><small>{when(obligation.current_period_start)} → {when(obligation.current_period_end)}</small><div className="period-state"><b>{period?.evidence_text ? (period.closed ? 'RECORDED / CLOSED' : 'EVIDENCE RECORDED') : 'AWAITING EVIDENCE'}</b><span>{period?.initial_verdict || 'No semantic verdict yet'}</span></div><button className="primary" onClick={onEvidence}>{period?.evidence_text ? 'Inspect evidence →' : 'Submit evidence →'}</button></aside></div><div className="ob-stats"><div className="score"><span>SETTLED SATISFACTION</span><strong>{progress}%</strong><i><b style={{ width: `${progress}%` }}/></i></div><Counter label="SATISFIED" value={obligation.satisfied_count}/><Counter label="DEFICIENT" value={obligation.deficient_count}/><Counter label="MISSED" value={obligation.missed_count}/><Counter label="STREAK" value={obligation.streak}/><button className="settle-link" onClick={onSettle}>{obligation.settlement_available ? 'SETTLEMENT READY →' : `SETTLED THROUGH #${obligation.settled_through}`}</button></div></div>; }
function ProofCard({ label, value, href, note }: { label: string; value: string; href: string; note: string }) { return <article className="proof-card"><Kicker>{label}</Kicker><code>{short(value, 12, 10)}</code><p>{note}</p><a href={href} target="_blank" rel="noreferrer">Open in Explorer ↗</a></article>; }
function ProofRow({ n, title, text }: { n: string; title: string; text: string }) { return <div className="proof-row"><b>{n}</b><strong>{title}</strong><span>{text}</span><Pill kind="good">PASS</Pill></div>; }
