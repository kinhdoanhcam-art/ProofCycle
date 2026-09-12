import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { CONFIG_OVERRIDE_MISMATCH, CONTRACT_ADDRESS, CONTRACT_EXPLORER_URL, DEPLOY_TX, SOURCE_SHA256 } from './config';
import { cleanError, connectWallet, executionErrorDetail, executionOutcome, getConfig, getObligation,
  getPeriod, getPeriods, getReport, txExplorerUrl, waitFinalized, walletProvider, writeMethod } from './genlayer';
import { profileMatches, requireState, snapshotUnchanged, stableRefusalSnapshot, verifyAttested, verifyCreated, verifyEvaluated, verifySettlement } from './postconditions';
import type { Address, Obligation, Period, ProofConfig, Report, TxHash } from './types';

type Page = 'cycle' | 'new' | 'obligation' | 'evidence' | 'repair' | 'settle' | 'proof';
const tabs: { key: Page; name: string }[] = [
  {key:'cycle',name:'Overview'},{key:'new',name:'Create'},{key:'obligation',name:'Obligation'},
  {key:'evidence',name:'Issuer report'},{key:'repair',name:'Remediation'},
  {key:'settle',name:'Ledger'},{key:'proof',name:'Proof'},
];
const short = (v?: string | null) => v ? `${v.slice(0, 8)}…${v.slice(-6)}` : '—';
const same = (a?: string | null, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
const time = (v?: number) => v ? new Date(v * 1000).toLocaleString() : '—';
const positive = (v: string) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : 0; };
function text(v: string, max: number) { const s = v.trim(); if (!s || s.length > max) throw new Error(`Enter 1–${max} characters.`); return s; }
function address(v: string) { if (!/^0x[0-9a-fA-F]{40}$/.test(v) || /^0x0{40}$/i.test(v)) throw new Error('Enter a nonzero 0x address (40 hex characters).'); return v; }
function Field({label,value,set,multi=false}: {label:string;value:string;set:(v:string)=>void;multi?:boolean}) {
  return <label className="work-field">{label}{multi?<textarea value={value} onChange={e=>set(e.target.value)}/>:<input value={value} onChange={e=>set(e.target.value)}/>}</label>;
}
function Card({title,children}: {title:string;children:ReactNode}) { return <section className="proof-card work-card"><div className="kicker">{title}</div>{children}</section>; }
function Row({name,value}: {name:string;value:ReactNode}) { return <div className="work-detail"><span>{name}</span><strong>{value}</strong></div>; }
export default function App() {
  const [page,setPage]=useState<Page>('cycle'); const [cfg,setCfg]=useState<ProofConfig|null>(null);
  const [account,setAccount]=useState<Address|null>(null); const [ob,setOb]=useState<Obligation|null>(null);
  const [period,setPeriod]=useState<Period|null>(null); const [initial,setInitial]=useState<Report|null>(null);
  const [repair,setRepair]=useState<Report|null>(null); const [rows,setRows]=useState<Period[]>([]);
  const [idText,setIdText]=useState(''); const [periodText,setPeriodText]=useState('1');
  const [responsible,setResponsible]=useState(''); const [issuer,setIssuer]=useState('');
  const [source,setSource]=useState(''); const [requirement,setRequirement]=useState('');
  const [periodSeconds,setPeriodSeconds]=useState('1200'); const [submissionSeconds,setSubmissionSeconds]=useState('1100');
  const [remediationSeconds,setRemediationSeconds]=useState('1100'); const [reference,setReference]=useState('');
  const [evidence,setEvidence]=useState(''); const [repairReference,setRepairReference]=useState('');
  const [repairEvidence,setRepairEvidence]=useState(''); const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState(''); const [error,setError]=useState(''); const [tx,setTx]=useState<TxHash|null>(null);
  const matched=Boolean(cfg && profileMatches(cfg) && !CONFIG_OVERRIDE_MISMATCH);
  const ready=Boolean(matched && account && !busy); const selected=Boolean(ob && period && positive(periodText)===period.period_number);
  const isIssuer=same(account,ob?.evidence_issuer), isResponsible=same(account,ob?.responsible_party);
  useEffect(()=>{
    getConfig().then(setCfg).catch(e=>setError(cleanError(e)));
    const onHash=()=>{const h=location.hash.replace('#/','');if(tabs.some(t=>t.key===h))setPage(h as Page);};
    onHash();window.addEventListener('hashchange',onHash);
    const provider=walletProvider();
    const onAccounts=(a:string[])=>{setAccount((a?.[0]||null) as Address|null);setNotice('Wallet account changed; inspect role before signing.');};
    const onChain=()=>{setNotice('Chain changed; StudioNet is required for writes.');getConfig().then(setCfg).catch(e=>setError(cleanError(e)));};
    provider?.on?.('accountsChanged',onAccounts);provider?.on?.('chainChanged',onChain);
    provider?.request({method:'eth_accounts'}).then((a:string[])=>{if(a?.[0])setAccount(a[0] as Address);}).catch(()=>undefined);
    return()=>{window.removeEventListener('hashchange',onHash);provider?.removeListener?.('accountsChanged',onAccounts);provider?.removeListener?.('chainChanged',onChain);};
  },[]);
  function go(next:Page){location.hash=`#/${next}`;setPage(next);window.scrollTo({top:0,behavior:'smooth'});}
  async function attempt(fn:()=>Promise<unknown>){try{setError('');await fn();}catch(e){setError(cleanError(e));}}
  async function load(id:number,n?:number){
    const item=await getObligation(id); const num=n||Math.max(1,item.latest_completed_period);
    const [p,a,b]=await Promise.all([getPeriod(id,num),getReport(id,num,false),getReport(id,num,true)]);
    setOb(item);setPeriod(p);setInitial(a);setRepair(b);setIdText(String(id));setPeriodText(String(num));
    return {item,p,a,b};
  }
  async function open(){const id=positive(idText);if(!id)throw new Error('Enter an existing obligation ID.');await load(id);setRows([]);go('obligation');}
  async function select(){if(!ob)throw new Error('Open an obligation first.');const n=positive(periodText);if(!n)throw new Error('Invalid period number.');await load(ob.obligation_id,n);}
  async function write(label:string,method:string,args:unknown[],verify:()=>Promise<void>,id?:number){
    if(!account)throw new Error('Connect a wallet.');if(busy)throw new Error('Wait for the current transaction.');
    const fresh=await getConfig();setCfg(fresh);
    if(!profileMatches(fresh)||CONFIG_OVERRIDE_MISMATCH)throw new Error('Contract profile or Vercel address override mismatches. Writes blocked.');
    setBusy(true);setError('');setTx(null);setNotice(`${label}: confirm in wallet…`);
    try{
      const hash=await writeMethod(account,method,args);setTx(hash);setNotice(`${label}: waiting for finalization ${short(hash)}…`);
      const receipt=await waitFinalized(hash), outcome=executionOutcome(receipt);
      if(outcome.ok===false)throw new Error(executionErrorDetail(receipt));
      await verify();setNotice(`${label}: ${outcome.ok===true?'execution and ':''}finalized postcondition verified${outcome.ok===null?' (execution enum unavailable)':''}.`);
      setCfg(await getConfig());if(id){await load(id,positive(periodText)||undefined);setRows([]);}
    }catch(e){setError(cleanError(e));}finally{setBusy(false);}
  }
  async function create(){
    if(!account)throw new Error('Connect creator wallet.');
    const r=address(responsible),i=address(issuer),s=text(source,160),req=text(requirement,2000);
    if(same(account,r)||same(account,i)||same(r,i))throw new Error('Creator, responsible party and issuer must be different wallets.');
    const p=positive(periodSeconds),sub=positive(submissionSeconds),rem=positive(remediationSeconds);
    if(!p||p>31536000||!sub||!rem||sub>=p||rem>=p)throw new Error('Use positive windows shorter than the period (maximum 31,536,000 seconds).');
    const before=await getConfig();
    await write('Create obligation','create_obligation',[r,i,s,req,p,sub,rem],async()=>{
      const after=await getConfig(),item=await getObligation(after.obligation_count);
      verifyCreated(before,after,item,account,r,i,s,req,p,sub,rem);
      await load(item.obligation_id,1);setRows([]);go('obligation');
    });
  }
  async function attest(remediation:boolean){
    if(!account||!ob||!period||!selected||!isIssuer)throw new Error('Open the period with designated issuer wallet.');
    if(!(remediation?period.remediation_open:period.submission_open))throw new Error('Issuer reporting window is closed.');
    const ref=text(remediation?repairReference:reference,256),body=text(remediation?repairEvidence:evidence,4000);
    const before=remediation?repair:initial;if(!before||before.exists)throw new Error('An immutable report already exists or has not loaded.');
    const id=ob.obligation_id,n=period.period_number,beforeOb=await getObligation(id);
    await write(remediation?'Attest remediation':'Attest period',remediation?'attest_remediation_report':'attest_period_report',
      [id,n,ref,body],async()=>{
        const [after,p,item]=await Promise.all([getReport(id,n,remediation),getPeriod(id,n),getObligation(id)]);
        verifyAttested(before,after,period,p,beforeOb,item,account,ref,body,remediation);
      },id);
  }
  async function evaluate(remediation:boolean){
    if(!account||!ob||!period||!selected||!isResponsible)throw new Error('Open the period with responsible party wallet.');
    if(!(remediation?period.remediation_open:period.submission_open))throw new Error('Evaluation window is closed.');
    const report=remediation?repair:initial;
    if(!report?.exists||!report.report_digest)throw new Error('Designated issuer must attest this period and phase first.');
    const id=ob.obligation_id,n=period.period_number,beforeOb=await getObligation(id);
    await write(remediation?'Evaluate remediation':'Evaluate issuer report',remediation?'remediate_period':'submit_period_evidence',
      [id,n,report.report_digest],async()=>{
        const [p,item,stored]=await Promise.all([getPeriod(id,n),getObligation(id),getReport(id,n,remediation)]);
        requireState(stored.report_digest===report.report_digest&&stored.evidence_text===report.evidence_text,'issuer report remains immutable');
        verifyEvaluated(period,p,beforeOb,item,report.report_digest,remediation);
      },id);
  }
  async function settle(){
    if(!ob)throw new Error('Open an obligation.');const before=await getObligation(ob.obligation_id);
    if(!before.settlement_available)throw new Error('No ordered settlement available.');const id=ob.obligation_id;
    await write('Settle periods','settle_periods',[id],async()=>{
      const after=await getObligation(id),count=after.settled_through-before.settled_through;
      requireState(count>0&&count<=20,'settlement advances 1–20 periods');
      verifySettlement(before,after,await getPeriods(id,before.settled_through+1,count));
    },id);
  }
  async function refusal(){
    if(!account||!ob||!period||!selected||!isResponsible||!period.submission_open||initial?.exists)
      throw new Error('Select an unreported period during the submission window with the responsible wallet.');
    const id=ob.obligation_id,n=period.period_number;
    const before=await Promise.all([getConfig(),getObligation(id),getPeriod(id,n),getReport(id,n,false)]);
    setBusy(true);setTx(null);setError('');setNotice('Expected refusal: confirm the controlled test transaction…');
    try{
      const hash=await writeMethod(account,'submit_period_evidence',[id,n,'']);setTx(hash);
      const outcome=executionOutcome(await waitFinalized(hash));
      const after=await Promise.all([getConfig(),getObligation(id),getPeriod(id,n),getReport(id,n,false)]);
      snapshotUnchanged(stableRefusalSnapshot(...before),stableRefusalSnapshot(...after));
      if(outcome.ok!==false)throw new Error('State unchanged, but explicit contract rejection not proven; inspect transaction.');
      setNotice('Contract refusal confirmed; finalized obligation, period and report unchanged.');
    }catch(e){setError(cleanError(e));}finally{setBusy(false);}
  }
  async function more(){if(!ob)throw new Error('Open an obligation.');const from=rows.length+1;
    if(from>ob.current_period)return;
    const next=await getPeriods(ob.obligation_id,from,Math.min(50,ob.current_period-from+1));
    requireState(next.length>0&&next[0].period_number===from,'history page starts at requested period');
    setRows(prev=>[...prev,...next]);
  }
  return <div className="app-shell"><header className="topbar"><div className="brand"><img src="/logo.svg" alt="ProofCycle"/><div><strong>ProofCycle</strong><span>issuer → period → ledger</span></div></div>
    <nav>{tabs.map((t,i)=><button key={t.key} className={page===t.key?'active':''} onClick={()=>go(t.key)}><b>{String(i).padStart(2,'0')}</b>{t.name}</button>)}</nav>
    <div className="head-actions"><a className="contract-chip" href={CONTRACT_EXPLORER_URL} target="_blank" rel="noreferrer"><i/>{short(CONTRACT_ADDRESS)}</a><button className="wallet" onClick={()=>attempt(async()=>{const a=await connectWallet();setAccount(a);setNotice(`Connected ${short(a)}`);})}>{account?short(account):'Connect wallet'}</button></div></header>
    <div className="signal-line"><b>{matched?'PROFILE MATCH':'WRITES LOCKED'}</b><span>{CONFIG_OVERRIDE_MISMATCH?'Remove stale VITE_CONTRACT_ADDRESS from Vercel and rebuild.':cfg?`${cfg.name} v${cfg.version} · ${cfg.evidence_mode}`:'Loading finalized StudioNet profile…'}</span></div>
    {error&&<div className="error-bar"><b>CHECK</b>{error}<button aria-label="Dismiss" onClick={()=>setError('')}>×</button></div>}
    {notice&&<div className="tx-bar"><span>STATUS</span>{notice}{tx&&<a href={txExplorerUrl(tx)} target="_blank" rel="noreferrer">View transaction ↗</a>}</div>}
    <main>{page==='cycle'&&<div className="page hero-page"><div className="hero-copy"><div className="kicker">GENLAYER / PERIOD-SPECIFIC EVIDENCE</div><h1>Evidence with <em>an issuer.</em></h1><p>Every obligation names a distinct evidence issuer. That wallet signs an immutable report after the observation period. The responsible party submits the stored digest; semantic verdicts and deterministic settlement are separate steps.</p><div className="hero-actions"><button className="primary" onClick={()=>go('new')}>Create obligation →</button><button onClick={()=>go('obligation')}>Inspect on-chain state</button></div></div><div className="cycle-visual"><div className="orbit orbit-a"/><div className="orbit orbit-b"/><div className="cycle-core"><span>PROOF CYCLE</span><strong>v2.0</strong></div><div className="node n1"><b>01 / ISSUER</b><span>ATTEST</span></div><div className="node n2"><b>02 / PARTY</b><span>EVALUATE</span></div><div className="node n3"><b>03 / LEDGER</b><span>SETTLE</span></div></div><div className="metric-strip"><div><span>SOURCE</span><strong>Issuer signed</strong><small>Designated distinct wallet</small></div><div><span>BOUNDARY</span><strong>Per period</strong><small>Completed observation window</small></div><div><span>EVALUATION</span><strong>Exact digest</strong><small>Immutable issuer report</small></div><div><span>LIVE STATUS</span><strong>Pending</strong><small>Behavioral runtime proof not yet complete</small></div></div></div>}
    {page==='new'&&<div className="page"><div className="page-head"><div><div className="kicker">01 / CREATE</div><h1>Define an obligation</h1><p>Creator, responsible party and evidence issuer must be three distinct wallets.</p></div></div><Card title="IMMUTABLE INPUTS"><div className="work-fields"><Field label="Responsible party address" value={responsible} set={setResponsible}/><Field label="Evidence issuer address" value={issuer} set={setIssuer}/><Field label="Issuer source name" value={source} set={setSource}/><Field label="Mandatory requirement" value={requirement} set={setRequirement} multi/></div><div className="work-fields timings"><Field label="Period seconds" value={periodSeconds} set={setPeriodSeconds}/><Field label="Submission window seconds" value={submissionSeconds} set={setSubmissionSeconds}/><Field label="Remediation window seconds" value={remediationSeconds} set={setRemediationSeconds}/></div><button className="primary" disabled={!ready} onClick={()=>attempt(create)}>Create on StudioNet</button><p>The source name does not establish the issuer’s real-world identity or independence.</p></Card></div>}
    {page!=='cycle'&&page!=='new'&&<div className="page"><div className="page-head"><div><div className="kicker">{tabs.find(t=>t.key===page)?.name.toUpperCase()} / FINALIZED STATE</div><h1>{page==='proof'?'Evidence & limitations':page==='obligation'?'Inspect obligation':page==='evidence'?'Issuer report':page==='repair'?'Repair a deficient period':'Ordered settlement'}</h1><p>Every success message requires finalized contract state after the transaction.</p></div>{page!=='proof'&&<div className="open-box"><input placeholder="Obligation ID" value={idText} onChange={e=>setIdText(e.target.value)}/><button disabled={busy} onClick={()=>attempt(open)}>Open</button></div>}</div>
    {page==='proof'?<div className="proof-grid"><Card title="SOURCE & DEPLOYMENT"><Row name="Contract" value={<a href={CONTRACT_EXPLORER_URL} target="_blank" rel="noreferrer">{CONTRACT_ADDRESS}</a>}/><Row name="SHA256" value={<code>{SOURCE_SHA256}</code>}/><Row name="Deploy tx" value={<a href={txExplorerUrl(DEPLOY_TX)} target="_blank" rel="noreferrer">{short(DEPLOY_TX)} ↗</a>}/><p>Deployment FINALIZED/SUCCESS and on-chain configuration match v2.0. Live behavioral testing still pending.</p></Card><Card title="TRUST BOUNDARY"><p>A signed issuer transaction authenticates control of its designated wallet and binds report contents to the obligation, period, source and phase. This does not prove real-world identity, issuer independence or truth of observations; review the issuer and referenced external records.</p><span className="pill warn">LIVE SEMANTIC VERIFICATION PENDING</span></Card></div>:!ob?<div className="empty"><h3>Open an obligation</h3><p>Enter an ID above to inspect finalized period state and issuer reports.</p></div>:<>
      <div className="obligation-board"><div className="ob-top"><div><span className="pill good">{ob.status}</span><span>OBLIGATION #{ob.obligation_id}</span></div><button disabled={busy} onClick={()=>attempt(()=>load(ob.obligation_id,positive(periodText)))}>Refresh</button></div><div className="ob-main"><div className="requirement-panel"><div className="kicker">{ob.source_name}</div><h2>Fixed requirement</h2><p>{ob.requirement_text}</p><div className="party-lines"><Row name="CREATOR" value={<code>{ob.creator}</code>}/><Row name="PARTY" value={<code>{ob.responsible_party}</code>}/><Row name="ISSUER" value={<code>{ob.evidence_issuer}</code>}/></div></div><div className="period-panel"><span>PERIOD IN VIEW</span><strong>{period?.period_number||'—'}</strong><small>Current: {ob.current_period} · Completed: {ob.latest_completed_period}</small><div className="period-state"><b>{period?.final_outcome||period?.initial_verdict||'AWAITING REPORT'}</b><span>{time(period?.period_start)} → {time(period?.period_end)}</span></div><div className="work-fields"><Field label="Period number" value={periodText} set={setPeriodText}/><button disabled={busy} onClick={()=>attempt(select)}>Load period</button></div></div></div></div>
      {page==='obligation'&&<div className="work-columns"><Card title="PERIOD WINDOWS"><Row name="Observation end" value={time(period?.period_end)}/><Row name="Submission deadline" value={time(period?.submission_deadline)}/><Row name="Remediation deadline" value={time(period?.remediation_deadline)}/><Row name="Initial verdict" value={period?.initial_verdict||'—'}/><Row name="Final outcome" value={period?.final_outcome||'—'}/></Card><Card title="ISSUER REPORT"><Row name="Attested" value={initial?.exists?time(initial.attested_at):'No report'}/><Row name="Reference" value={initial?.record_reference||'—'}/><Row name="Digest" value={<code>{initial?.report_digest||'—'}</code>}/><p className="observations">{initial?.evidence_text||'No issuer observations for this period.'}</p></Card></div>}
      {page==='evidence'&&<div className="work-columns"><Card title="1 / DESIGNATED ISSUER"><p>After the observation ends, cite a period-specific external record and attest your observations before the submission deadline.</p><Row name="Your role" value={isIssuer?'DESIGNATED ISSUER':'SWITCH TO ISSUER WALLET'}/><Row name="Observation end" value={time(period?.period_end)}/><Row name="Submission deadline" value={time(period?.submission_deadline)}/><Field label="Record reference / transaction hash / URL" value={reference} set={setReference}/><Field label="Issuer observations" value={evidence} set={setEvidence} multi/><button className="primary" disabled={!ready||!isIssuer||!selected||!period?.submission_open||!!initial?.exists} onClick={()=>attempt(()=>attest(false))}>Attest immutable report</button></Card><Card title="2 / RESPONSIBLE PARTY"><p>The responsible party can only evaluate the issuer’s exact stored report digest.</p><Row name="Your role" value={isResponsible?'RESPONSIBLE PARTY':'SWITCH TO PARTY WALLET'}/><Row name="Reference" value={initial?.record_reference||'Awaiting issuer'}/><Row name="Digest" value={<code>{initial?.report_digest||'—'}</code>}/><p className="observations">{initial?.evidence_text||'No issuer observations yet.'}</p><button className="primary" disabled={!ready||!isResponsible||!selected||!period?.submission_open||!initial?.exists} onClick={()=>attempt(()=>evaluate(false))}>Evaluate exact digest</button><Row name="Verdict" value={period?.initial_verdict||'Not evaluated'}/>{isResponsible&&period?.submission_open&&!initial?.exists&&<button disabled={!ready} onClick={()=>attempt(refusal)}>Test refusal without issuer report</button>}</Card></div>}
      {page==='repair'&&<div className="work-columns"><Card title="1 / ISSUER REMEDIATION"><p>After a deficient initial verdict, the same issuer may attest one immutable remediation report before the deadline.</p><Row name="Initial verdict" value={period?.initial_verdict||'—'}/><Row name="Deadline" value={time(period?.remediation_deadline)}/><Field label="New record reference" value={repairReference} set={setRepairReference}/><Field label="New issuer observations" value={repairEvidence} set={setRepairEvidence} multi/><button className="primary" disabled={!ready||!selected||!isIssuer||!period?.remediation_open||!!repair?.exists} onClick={()=>attempt(()=>attest(true))}>Attest remediation</button></Card><Card title="2 / RESPONSIBLE PARTY"><Row name="Initial deficiency retained" value={period?.initial_deficient_history?'YES':'NO'}/><Row name="Issuer reference" value={repair?.record_reference||'Awaiting issuer'}/><Row name="Digest" value={<code>{repair?.report_digest||'—'}</code>}/><p className="observations">{repair?.evidence_text||'No remediation report.'}</p><button className="primary" disabled={!ready||!selected||!isResponsible||!period?.remediation_open||!repair?.exists} onClick={()=>attempt(()=>evaluate(true))}>Evaluate remediation digest</button><Row name="Final outcome" value={period?.final_outcome||'Awaiting close'}/></Card></div>}
      {page==='settle'&&<><div className="settle-board"><div className="status-dial"><span>DERIVED STATUS</span><strong>{ob.status}</strong><small>Settled through period #{ob.settled_through}</small></div><div className="counter-bank"><div><span>SATISFIED</span><strong>{ob.satisfied_count}</strong></div><div><span>DEFICIENT</span><strong>{ob.deficient_count}</strong></div><div><span>MISSED</span><strong>{ob.missed_count}</strong></div><div><span>STREAK</span><strong>{ob.streak}</strong></div><div><span>SEMANTIC EVALS</span><strong>{ob.semantic_eval_count}</strong></div><div><span>READY</span><strong>{ob.settlement_available?'YES':'NO'}</strong></div></div><div className="settle-action"><div className="kicker">ORDERED BATCH</div><p>Anyone may settle the next ready periods in order, up to 20 per call.</p><button className="primary" disabled={!ready||!ob.settlement_available} onClick={()=>attempt(settle)}>Settle ready periods</button></div></div><div className="history-head"><div><div className="kicker">PERIOD LEDGER</div><h2>{rows.length} / {ob.current_period} periods loaded</h2></div><button disabled={busy||rows.length>=ob.current_period} onClick={()=>attempt(more)}>Load next 50</button></div><div className="period-table"><div className="period-row header"><span>#</span><span>OBSERVATION END</span><span>INITIAL</span><span>FINAL</span><span>CACHE</span><span>SETTLED</span></div>{rows.map(p=><div className="period-row" key={p.period_number}><span>{p.period_number}</span><span>{time(p.period_end)}</span><span>{p.initial_verdict||'—'}</span><span>{p.final_outcome||'—'}</span><span>{p.initial_used_cache||p.remediation_used_cache?'YES':'NO'}</span><span>{p.settled?'YES':'NO'}</span></div>)}</div></>}
    </>}</div>}</main><footer><div className="brand compact"><img src="/logo.svg" alt=""/><div/></div><span>PROOFCYCLE / STUDIO NET</span><span>Issuer identity and external facts need independent review.</span><a href={CONTRACT_EXPLORER_URL} target="_blank" rel="noreferrer">Explore contract ↗</a></footer></div>;
}
