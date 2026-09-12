import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root = resolve(new URL('..', import.meta.url).pathname);
const read = p => readFileSync(resolve(root,p),'utf8');
const source = readFileSync(resolve(root,'contracts/ProofCycle.py'));
const sha = createHash('sha256').update(source).digest('hex');
const release = JSON.parse(read('release.json'));
const address = '0x2B37e48581D888cc635Fd716456328F1411700D7';
if (sha !== '6070ef9c487e5fafbb8141e1d6c2722fea94333a218f40a79f9665049b9c7b0b' || sha !== release.contract_sha256)
  throw new Error('Production source SHA256 mismatch');
if (read('SOURCE_SHA256.txt').trim() !== `${sha}  contracts/ProofCycle.py`) throw new Error('Source checksum file mismatch');
if (release.stage !== 'RUNTIME_VERIFIED_FRONTEND_UPDATE_PENDING' || release.deployment_address.toLowerCase() !== address.toLowerCase() || !release.runtime_verified || !release.semantic_live_verified || !release.frontend_integrated)
  throw new Error('Release status or address mismatch');
for (const hash of [
  '0x381c9bdbde0cd7a59a49ea649f004e3d147fb1b430c58fce3ccf91c927eee36e',
  '0xfb0602e99944a49d6c267bd5afa71c887fa46cb49ce9d14462e54641c93d754c',
  '0x01fc550870701c40fd5295d9218ecfb7eb3ec81a9b8320a3f1f9d46192937dcd',
  '0x422a7c4f6a8ccd590ef0601391dfb44d5c57ea7c2513fa9a51f36657f50327f3',
]) if (!read('RUNTIME_EVIDENCE.md').includes(hash)) throw new Error('Missing live runtime transaction evidence: '+hash);
for (const [path,markers] of Object.entries({
  'contracts/ProofCycle.py':['class ObligationProof(gl.Contract):','"version": "2.0"','"cache_scope": "OBLIGATION_PERIOD"','"evidence_mode": "AUTHENTICATED_ISSUER_REPORT"'],
  'src/config.ts':[sha,address],
  'src/genlayer.ts':['getReport','getPeriod','getConfig','writeMethod'],
  'src/App.tsx':['attest_period_report','attest_remediation_report','submit_period_evidence','remediate_period','settle_periods','verifySettlement'],
  'src/postconditions.ts':['verifyAttested','verifyEvaluated','verifySettlement','snapshotUnchanged'],
  'src/txOutcome.ts':['leader_receipt','execution_result','rollback','SUCCESS'],
})) {
  if (!existsSync(resolve(root,path))) throw new Error(`Missing ${path}`);
  for (const m of markers) if (!read(path).includes(m)) throw new Error(`${path} missing ${m}`);
}
const publicFiles = ['src/App.tsx','src/config.ts','src/genlayer.ts','src/postconditions.ts','src/txOutcome.ts','README.md','TESTING.md','index.html'];
for (const file of publicFiles) {
  if (/0xcd661ee97b358948c4b943c8d2b5f4195e54d75e|0x50b778a214ad3e83e5ea24da939636ae2547a5ab|5588c08cf5b5e82ad4a1b8776c8c55fa48f8b8ec1f8b923cd2c2c69028c2df69/i.test(read(file)))
    throw new Error('Legacy v1 deployment/source in public file '+file);
}
console.log('Static production source, address, ABI and claim gates PASS: '+sha);
