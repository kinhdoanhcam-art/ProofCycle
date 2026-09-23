import fs from "node:fs";


const source = fs.readFileSync(new URL("../src/ids.ts", import.meta.url), "utf8");
if (!source.includes("const cleaned = pyCollapse(text);")) {
  throw new Error("computeRuleId must hash pyCollapse(text)");
}
if (!source.includes("const cleaned = pyStrip(name);")) {
  throw new Error("computeGateId must retain pyStrip(name)");
}

const PY_SPACE =
  "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const start = new RegExp("^[" + PY_SPACE + "]+");
const end = new RegExp("[" + PY_SPACE + "]+$");
const pyStrip = (value) => value.replace(start, "").replace(end, "");
const pyCollapse = (value) =>
  value.split(new RegExp("[" + PY_SPACE + "]+")).filter(Boolean).join(" ");

const pythonWhitespace = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
  0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004,
  0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029,
  0x202f, 0x205f, 0x3000,
]);

for (let cp = 0; cp < 0x110000; cp += 1) {
  if (cp >= 0xd800 && cp <= 0xdfff) continue;
  const ch = String.fromCodePoint(cp);
  const actual = pyStrip(`${ch}A${ch}`) === "A";
  const expected = pythonWhitespace.has(cp);
  if (actual !== expected) {
    throw new Error(`pyStrip parity mismatch at U+${cp.toString(16).toUpperCase()}`);
  }

  const collapsed = pyCollapse(`A${ch}${ch}B`);
  const expectedCollapsed = expected ? "A B" : `A${ch}${ch}B`;
  if (collapsed !== expectedCollapsed) {
    throw new Error(`pyCollapse parity mismatch at U+${cp.toString(16).toUpperCase()}`);
  }
}

console.log("pyStrip/pyCollapse full Unicode parity: PASS");
