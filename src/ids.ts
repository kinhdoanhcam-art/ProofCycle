import { keccak256, stringToBytes } from "viem";

/**
 * Local, RPC-free reimplementation of the contract's content-addressed IDs.
 *
 * PrereqLock.py:
 *   gate_id = Keccak256("CONDITION_DIRECTION:GATE:V1|" + str(creator).lower()
 *                       + "|" + len(clean_name) + "|" + clean_name).hexdigest()
 *   rule_id = Keccak256("CONDITION_DIRECTION:RULE:V1|" + gate_id
 *                       + "|" + len(clean_text) + "|" + clean_text).hexdigest()
 *
 * Gate names use Python's str.strip(). Rule text additionally collapses every
 * internal run of Python whitespace to one ASCII space.
 */

/**
 * Python's str.strip() removes every character where str.isspace() is True.
 * That set is NOT the same as JavaScript's String.prototype.trim():
 *
 *   Python strips, JS does not:  U+001C U+001D U+001E U+001F U+0085
 *   JS strips, Python does not:  U+FEFF
 *
 * A single leading U+0085 (NEL, common in text pasted from Windows and from
 * PDF extraction) is enough to make the browser and the contract hash two
 * different strings, which produces a gate_id/rule_id that does not exist
 * on chain. This class is the exact 29-code-point Python set.
 */
const PY_SPACE =
  "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PY_TRIM_START = new RegExp("^[" + PY_SPACE + "]+");
const PY_TRIM_END = new RegExp("[" + PY_SPACE + "]+$");

/** Byte-for-byte equivalent of Python str.strip(). */
export function pyStrip(value: string): string {
  return value.replace(PY_TRIM_START, "").replace(PY_TRIM_END, "");
}

/** Equivalent of " ".join(value.split()) for Python whitespace. */
export function pyCollapse(value: string): string {
  return value
    .split(new RegExp("[" + PY_SPACE + "]+"))
    .filter(Boolean)
    .join(" ");
}

/** Python len() counts code points, not UTF-16 units. */
export function pyLen(value: string): number {
  return Array.from(value).length;
}

function digest(payload: string): string {
  return keccak256(stringToBytes(payload)).slice(2).toLowerCase();
}

export function computeGateId(creator: string, name: string): string {
  const cleaned = pyStrip(name);
  const payload =
    "CONDITION_DIRECTION:GATE:V1|" +
    creator.toLowerCase() +
    "|" +
    pyLen(cleaned) +
    "|" +
    cleaned;

  return digest(payload);
}

export function computeRuleId(gateId: string, text: string): string {
  const cleaned = pyCollapse(text);
  const payload =
    "CONDITION_DIRECTION:RULE:V1|" +
    gateId.toLowerCase() +
    "|" +
    pyLen(cleaned) +
    "|" +
    cleaned;

  return digest(payload);
}

export function normalizeGateId(value: string): string {
  return pyStrip(value).toLowerCase().replace(/^0x/, "");
}
