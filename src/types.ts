export type GateState = "LOCKED" | "ARMED" | "READY" | "DONE";

export type GateRecord = {
  gate_id: string;
  creator: string;
  actor: string;
  name: string;
  action_label: string;
  condition_label: string;
  edge_installed: boolean;
  condition_met: boolean;
  action_done: boolean;
  attempt_count: number;
  state: GateState;
};

export type AttemptRecord = {
  attempt_number: number;
  rule_id: string;
  verdict: "CONDITION_NECESSARY" | "CONDITION_NOT_NECESSARY" | string;
  installs_edge: boolean;
};

export type TxUiState =
  | { kind: "idle"; message: string }
  | { kind: "signing"; message: string }
  | { kind: "submitted"; message: string; hash: string }
  | { kind: "error"; message: string };
