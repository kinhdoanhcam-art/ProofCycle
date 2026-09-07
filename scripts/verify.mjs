import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const contractPath = resolve(root, 'contracts', 'ProofCycle.py');
const expectedSha = '5588c08cf5b5e82ad4a1b8776c8c55fa48f8b8ec1f8b923cd2c2c69028c2df69';
const projectAddress = '0xcd661Ee97B358948c4B943C8d2B5f4195E54D75E';
const runtimeAddress = '0x50B778A214AD3e83E5eA24Da939636AE2547A5Ab';

if (!existsSync(contractPath)) throw new Error('contracts/ProofCycle.py is missing');
if (existsSync(resolve(root, 'contracts', 'ObligationProof.py'))) throw new Error('Legacy public contract filename must not be present');

const contract = readFileSync(contractPath);
const actualSha = createHash('sha256').update(contract).digest('hex');
if (actualSha !== expectedSha) throw new Error(`Contract SHA mismatch: ${actualSha}`);

const source = contract.toString('utf8');
for (const marker of [
  'class ObligationProof(gl.Contract):',
  '"name": "ObligationProof"',
  '"version": "1.1"',
  '"cache_scope": "OBLIGATION"',
  '"semantic_scope": "TEXTUAL_EVIDENCE_SUPPORT"',
  '"external_truth_verified": False',
]) {
  if (!source.includes(marker)) throw new Error(`Frozen contract marker missing: ${marker}`);
}

const cfg = readFileSync(resolve(root, 'src', 'config.ts'), 'utf8');
for (const marker of [expectedSha, projectAddress, runtimeAddress]) {
  if (!cfg.includes(marker)) throw new Error(`config.ts missing expected value: ${marker}`);
}

const banned = /\b(Claude|ChatGPT|OpenAI|Anthropic)\b|internal review|review request|AI feedback|predeploy review/i;
const skip = new Set(['node_modules', 'dist', '.git']);
function scan(dir) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const p = resolve(dir, name); const s = statSync(p);
    if (s.isDirectory()) scan(p);
    else if (/\.(?:md|txt|ts|tsx|js|mjs|json|html|py|svg)$/i.test(name)) {
      if (relative(root, p) === 'scripts/verify.mjs') continue;
      const text = readFileSync(p, 'utf8');
      if (banned.test(text)) throw new Error(`Public hygiene marker found in ${relative(root, p)}`);
    }
  }
}
scan(root);

console.log('ProofCycle project verification PASS');
console.log(`Contract SHA256: ${actualSha}`);
console.log(`Project address: ${projectAddress}`);
console.log(`Runtime evidence: ${runtimeAddress}`);
