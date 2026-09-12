import test from 'node:test';
import assert from 'node:assert/strict';
import {profileMatches,verifyAttested,verifyEvaluated,verifySettlement,snapshotUnchanged,stableRefusalSnapshot} from '../src/postconditions.ts';
const digest='a'.repeat(64);
const cfg={name:'ObligationProof',version:'2.0',evidence_mode:'AUTHENTICATED_ISSUER_REPORT',
 authentication:'DESIGNATED_ISSUER_ONCHAIN_TRANSACTION',semantic_scope:'ISSUER_ATTESTED_PERIOD_REQUIREMENT_SUPPORT',
 cache_scope:'OBLIGATION_PERIOD',reports_after_period_end:true,self_submitted_text_allowed:false,
 external_truth_verified:false,issuer_identity_verified:false,issuer_independence_verified:false,
 max_fresh_semantic_evals_per_period:2,max_settle_batch:20,max_page_size:50};
const ob={obligation_id:1,evidence_issuer:'0x123',responsible_party:'0x456',source_name:'Signed audit',
 requirement_digest:'b'.repeat(64),semantic_eval_count:0,settled_through:0,
 satisfied_count:0,deficient_count:0,missed_count:0,streak:0,status:'ACTIVE'};
const period={obligation_id:1,period_number:1,period_start:100,period_end:200,
 submission_deadline:300,remediation_deadline:0,initial_report_digest:'',remediation_report_digest:'',
 initial_verdict:'',remediation_verdict:'',initial_deficient_history:false,
 submitted_at:0,remediation_submitted_at:0,initial_used_cache:false,remediation_used_cache:false,
 final_outcome:'',closed:false};
test('profile gate rejects the old self-submission model',()=>{
 assert.equal(profileMatches(cfg),true);
 assert.equal(profileMatches({...cfg,self_submitted_text_allowed:true}),false);
 assert.equal(profileMatches({...cfg,cache_scope:'OBLIGATION'}),false);
});
test('attestation must preserve phase, period provenance and cannot evaluate',()=>{
 const before={exists:false,report_digest:''};
 const after={exists:true,phase:'initial',obligation_id:1,period_number:1,evidence_issuer:'0x123',
 responsible_party:'0x456',source_name:'Signed audit',requirement_digest:'b'.repeat(64),
 period_start:100,period_end:200,record_reference:'explorer/tx',evidence_text:'Observed result',report_digest:digest,attested_at:201};
 verifyAttested(before,after,period,{...period,initial_report_digest:digest},ob,ob,'0x123','explorer/tx','Observed result',false);
 assert.throws(()=>verifyAttested(before,{...after,period_number:2},period,{...period,initial_report_digest:digest},ob,ob,'0x123','explorer/tx','Observed result',false),/provenance/);
 assert.throws(()=>verifyAttested(before,after,period,{...period,initial_report_digest:digest},ob,{...ob,semantic_eval_count:1},'0x123','explorer/tx','Observed result',false),/evaluate or settle/);
});
test('deficient initial verdict stays open and fresh evaluation increments once',()=>{
 const prior={...period,initial_report_digest:digest};
 const after={...prior,submitted_at:210,initial_verdict:'COMPLIANCE_DEFICIENT',
 initial_deficient_history:true,initial_used_cache:false,final_outcome:'',closed:false};
 verifyEvaluated(prior,after,ob,{...ob,semantic_eval_count:1},digest,false);
 assert.throws(()=>verifyEvaluated(prior,{...after,closed:true,final_outcome:'COMPLIANCE_DEFICIENT'},ob,{...ob,semantic_eval_count:1},digest,false),/phase state/);
 assert.throws(()=>verifyEvaluated(prior,after,ob,{...ob,semantic_eval_count:0},digest,false),/fresh evaluation/);
});
test('ordered settlement verifies exact status, counters and refusal rollback',()=>{
 const after={...ob,settled_through:2,satisfied_count:1,missed_count:1,streak:0,status:'AT_RISK'};
 const rows=[{period_number:1,settled:true,closed:true,final_outcome:'COMPLIANCE_SATISFIED'},
 {period_number:2,settled:true,closed:true,final_outcome:'MISSED'}];
 verifySettlement(ob,after,rows);
 assert.throws(()=>verifySettlement(ob,{...after,status:'ACTIVE'},rows),/ledger and status/);
 assert.throws(()=>verifySettlement(ob,after,[rows[1],rows[0]]),/ordered closed row/);
 snapshotUnchanged([ob,period],[{...ob},{...period}]);
 assert.throws(()=>snapshotUnchanged([ob,period],[{...ob,semantic_eval_count:1},period]),/roll back/);
 const r={exists:false,report_digest:''};
 snapshotUnchanged(stableRefusalSnapshot(cfg,{...ob,current_period:1,settlement_available:false},{...period,submission_open:true},r),
   stableRefusalSnapshot(cfg,{...ob,current_period:2,settlement_available:true},{...period,submission_open:false},r));
});
