/// <reference types="vite/client" />

declare interface Window {
  ethereum?: {
    request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  };
}
