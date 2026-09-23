export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const text = error.message;

    const rollback = text.match(/\[rollback\]\s*([^\n]+)/i);
    if (rollback?.[1]) return rollback[1].trim();

    const userError = text.match(/UserError[:\s]+([^\n]+)/i);
    if (userError?.[1]) return userError[1].trim();

    if (/user rejected|rejected the request|denied/i.test(text)) {
      return "Wallet request was rejected.";
    }

    return text.length > 220 ? text.slice(0, 217) + "…" : text;
  }

  return String(error);
}
