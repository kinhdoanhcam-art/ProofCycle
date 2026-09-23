import {
  ArrowRight,
  BookOpenText,
  Check,
  Clipboard,
  ExternalLink,
  FileKey2,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  Unplug,
  Wallet,
  Waypoints,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EXPLORER_URL,
  EXPLORER_BASE,
  MAX_LABEL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_RULE_TEXT_LENGTH,
} from "./config";
import { errorMessage } from "./errors";
import {
  computeGateId,
  computeRuleId,
  normalizeGateId,
  pyCollapse,
  pyLen,
  pyStrip,
} from "./ids";
import {
  connectStudioNet,
  getAttempts,
  getGate,
  leaderRollbackReason,
  writeMethod,
} from "./genlayer";
import type { AttemptRecord, GateRecord, GateState, TxUiState } from "./types";

type Tab = "gate" | "log";

type PendingExpectation =
  | { kind: "create"; gateId: string; hash: string }
  | { kind: "rule"; gateId: string; minAttempts: number; hash: string }
  | { kind: "condition"; gateId: string; hash: string }
  | { kind: "action"; gateId: string; hash: string };

const DEMO = {
  name: "Cargo departure gate",
  action: "cargo leaving the depot",
  condition: "a countersigned manifest",
  necessary:
    "Cargo may leave the depot only after the manifest carries a countersignature.",
  alternative:
    "Cargo may leave the depot with a countersigned manifest, or with written clearance from the night supervisor instead.",
};

const STATE_ORDER: GateState[] = ["LOCKED", "ARMED", "READY", "DONE"];

function short(value: string, head = 6, tail = 5) {
  if (!value) return "—";
  return value.length <= head + tail + 2
    ? value
    : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function isSameAddress(a?: string, b?: string) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function App() {
  const [tab, setTab] = useState<Tab>("gate");
  const [account, setAccount] = useState("");
  const [connecting, setConnecting] = useState(false);

  const [name, setName] = useState(DEMO.name);
  const [actionLabel, setActionLabel] = useState(DEMO.action);
  const [conditionLabel, setConditionLabel] = useState(DEMO.condition);
  const [actor, setActor] = useState("");
  const [ruleText, setRuleText] = useState(DEMO.necessary);

  const [gateIdInput, setGateIdInput] = useState("");
  const [gate, setGate] = useState<GateRecord | null>(null);
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [loadingGate, setLoadingGate] = useState(false);
  const [loadingLog, setLoadingLog] = useState(false);

  const [busy, setBusy] = useState("");
  // Synchronous guard. React state is async, so `busy` alone does not stop two
  // clicks landing in the same tick.
  const inFlight = useRef(false);
  const pendingExpectation = useRef<PendingExpectation | null>(null);
  const autoRefreshTimer = useRef<number | null>(null);
  const [tx, setTx] = useState<TxUiState>({
    kind: "idle",
    message: "No transaction submitted.",
  });

  const isCreator = isSameAddress(account, gate?.creator);
  const isActor = isSameAddress(account, gate?.actor);

  const clearAutoRefreshTimer = useCallback(() => {
    if (autoRefreshTimer.current !== null) {
      window.clearTimeout(autoRefreshTimer.current);
      autoRefreshTimer.current = null;
    }
  }, []);

  const pendingSatisfied = useCallback(
    (next: GateRecord, pending: PendingExpectation) => {
      if (normalizeGateId(next.gate_id) !== normalizeGateId(pending.gateId)) {
        return false;
      }

      if (pending.kind === "create") return true;
      if (pending.kind === "rule") {
        return next.attempt_count >= pending.minAttempts;
      }
      if (pending.kind === "condition") return next.condition_met;
      if (pending.kind === "action") return next.action_done;

      return false;
    },
    []
  );

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setTx({ kind: "error", message: "MetaMask was not found." });
      return;
    }

    setConnecting(true);

    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      const next = accounts?.[0] ?? "";
      if (!next) throw new Error("No wallet account was returned.");

      await connectStudioNet(next);
      setAccount(next);
      setTx({ kind: "idle", message: "Wallet connected to StudioNet." });
    } catch (error) {
      setTx({ kind: "error", message: errorMessage(error) });
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(async () => {
    try {
      await window.ethereum?.request({
        method: "wallet_revokePermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch {
      // Some wallets do not implement wallet_revokePermissions.
    } finally {
      setAccount("");
      setGate(null);
      setAttempts([]);
      setGateIdInput("");
      clearAutoRefreshTimer();
      pendingExpectation.current = null;
      inFlight.current = false;
      setBusy("");
      setTx({
        kind: "idle",
        message:
          "Disconnected locally. If MetaMask still shows this site as connected, revoke it in Connected sites.",
      });
    }
  }, [clearAutoRefreshTimer]);

  useEffect(() => {
    if (!window.ethereum?.on) return;

    const onAccountsChanged = (...args: any[]) => {
      const accounts = (args[0] ?? []) as string[];
      const next = accounts[0] ?? "";
      setAccount(next);
      clearAutoRefreshTimer();
      pendingExpectation.current = null;
      inFlight.current = false;
      setBusy("");
      setGate(null);
      setAttempts([]);
      setTx({
        kind: "idle",
        message: next
          ? "Wallet account changed. Load your gate again."
          : "Wallet disconnected.",
      });
    };

    const onChainChanged = () => {
      clearAutoRefreshTimer();
      pendingExpectation.current = null;
      inFlight.current = false;
      setBusy("");
      setGate(null);
      setAttempts([]);
      setTx({
        kind: "idle",
        message: "Network changed. Reconnect to StudioNet before writing.",
      });
    };

    window.ethereum.on("accountsChanged", onAccountsChanged);
    window.ethereum.on("chainChanged", onChainChanged);

    return () => {
      window.ethereum?.removeListener?.("accountsChanged", onAccountsChanged);
      window.ethereum?.removeListener?.("chainChanged", onChainChanged);
    };
  }, [clearAutoRefreshTimer]);

  const refreshGate = useCallback(
    async (id?: string) => {
      const target = normalizeGateId(id ?? gate?.gate_id ?? gateIdInput);
      if (!target) {
        setTx({ kind: "error", message: "Enter a gate ID first." });
        return;
      }

      setLoadingGate(true);
      try {
        const next = await getGate(target);
        setGate(next);
        setGateIdInput(next.gate_id);

        const pending = pendingExpectation.current;
        if (pending) {
          if (pendingSatisfied(next, pending)) {
            pendingExpectation.current = null;
            clearAutoRefreshTimer();
            setBusy("");
            setTx({
              kind: "idle",
              message: "Accepted contract state updated automatically.",
            });
          } else {
            setTx((current) =>
              current.kind === "submitted"
                ? {
                    ...current,
                    message:
                      "Transaction is submitted, but the expected accepted state is not visible yet. Wait a little longer and use Load accepted state.",
                  }
                : current
            );
          }
        } else {
          setBusy("");
          setTx({ kind: "idle", message: "Accepted contract state refreshed." });
        }
      } catch (error) {
        if (pendingExpectation.current) {
          setTx((current) =>
            current.kind === "submitted"
              ? {
                  ...current,
                  message:
                    "Transaction is still pending or accepted state is not available yet. Wait a little longer and use Load accepted state.",
                }
              : current
          );
        } else {
          setTx({ kind: "error", message: errorMessage(error) });
        }
      } finally {
        setLoadingGate(false);
      }
    },
    [
      gate?.gate_id,
      gateIdInput,
      pendingSatisfied,
      clearAutoRefreshTimer,
    ]
  );

  const scheduleAcceptedStateRefresh = useCallback(
    (gateId: string) => {
      clearAutoRefreshTimer();
      autoRefreshTimer.current = window.setTimeout(() => {
        autoRefreshTimer.current = null;
        void (async () => {
          await refreshGate(gateId);

          const pending = pendingExpectation.current;
          if (!pending || normalizeGateId(pending.gateId) !== normalizeGateId(gateId)) {
            return;
          }

          const rollback = await leaderRollbackReason(pending.hash);
          if (!rollback) return;

          pendingExpectation.current = null;
          inFlight.current = false;
          setBusy("");
          setTx({ kind: "error", message: rollback });
        })();
      }, 25000);
    },
    [clearAutoRefreshTimer, refreshGate]
  );

  const refreshLog = useCallback(async () => {
    const target = normalizeGateId(gate?.gate_id ?? gateIdInput);
    if (!target) {
      setTx({ kind: "error", message: "Load a gate first." });
      return;
    }

    setLoadingLog(true);
    try {
      const rows = await getAttempts(target, 0, 20);
      setAttempts(rows);
    } catch (error) {
      setTx({ kind: "error", message: errorMessage(error) });
    } finally {
      setLoadingLog(false);
    }
  }, [gate?.gate_id, gateIdInput]);

  const submitWrite = useCallback(
    async (
      key: string,
      method: string,
      args: unknown[],
      successMessage: string
    ) => {
      if (!account) {
        setTx({ kind: "error", message: "Connect MetaMask first." });
        return null;
      }

      if (inFlight.current || busy) return null;

      inFlight.current = true;
      setBusy(key);
      setTx({ kind: "signing", message: "Confirm the transaction in MetaMask." });

      try {
        await connectStudioNet(account);
        const hash = await writeMethod(account, method, args);
        setTx({
          kind: "submitted",
          message:
            successMessage +
            " The transaction is submitted. PrereqLock will check accepted state once automatically after about 25 seconds; manual refresh remains available.",
          hash,
        });
        // Deliberately do NOT clear `busy` here. The write is submitted but the
        // contract state is not accepted yet; re-enabling the button now is the
        // duplicate-submission window. It is cleared by refreshGate().
        inFlight.current = false;
        return hash;
      } catch (error) {
        setTx({ kind: "error", message: errorMessage(error) });
        inFlight.current = false;
        setBusy("");
        return null;
      }
    },
    [account, busy]
  );

  const createGate = useCallback(async () => {
    // pyStrip / pyLen, not trim / .length: the contract cleans with Python
    // str.strip() and measures with len(), which counts code points.
    const cleanName = pyStrip(name);
    const cleanAction = pyStrip(actionLabel);
    const cleanCondition = pyStrip(conditionLabel);
    const cleanActor = pyStrip(actor);

    if (!cleanName || !cleanAction || !cleanCondition || !cleanActor) {
      setTx({ kind: "error", message: "Name, both labels and actor address are required." });
      return;
    }

    if (!/^0x[0-9a-fA-F]{40}$/.test(cleanActor)) {
      setTx({ kind: "error", message: "Enter a valid actor address." });
      return;
    }

    if (
      pyLen(cleanName) > MAX_NAME_LENGTH ||
      pyLen(cleanAction) > MAX_LABEL_LENGTH ||
      pyLen(cleanCondition) > MAX_LABEL_LENGTH
    ) {
      setTx({ kind: "error", message: "One of the fields exceeds its contract limit." });
      return;
    }

    if (!account) {
      setTx({ kind: "error", message: "Connect MetaMask first." });
      return;
    }


    if (isSameAddress(account, cleanActor)) {
      setTx({ kind: "error", message: "Actor must use a different wallet from the gate creator." });
      return;
    }

    const expectedId = computeGateId(account, cleanName);

    const hash = await submitWrite(
      "create",
      "create_gate",
      [cleanName, cleanAction, cleanCondition, cleanActor],
      "Gate creation submitted."
    );

    if (hash) {
      pendingExpectation.current = {
        kind: "create",
        gateId: expectedId,
        hash,
      };
      setGateIdInput(expectedId);
      setGate(null);
      setAttempts([]);
      scheduleAcceptedStateRefresh(expectedId);
    }
  }, [
    account,
    actionLabel,
    actor,
    conditionLabel,
    name,
    submitWrite,
    scheduleAcceptedStateRefresh,
  ]);

  const submitRule = useCallback(async () => {
    if (!gate) {
      setTx({ kind: "error", message: "Load a gate first." });
      return;
    }

    const clean = pyCollapse(ruleText);

    if (!clean) {
      setTx({ kind: "error", message: "Rule text cannot be empty." });
      return;
    }

    if (pyLen(clean) > MAX_RULE_TEXT_LENGTH) {
      setTx({ kind: "error", message: "Rule text exceeds 1200 characters." });
      return;
    }

    const localRuleId = computeRuleId(gate.gate_id, clean);

    const hash = await submitWrite(
      "rule",
      "submit_rule",
      [gate.gate_id, clean],
      `Rule submitted for consensus. Local rule ID: ${short(localRuleId, 10, 8)}.`
    );

    if (hash) {
      pendingExpectation.current = {
        kind: "rule",
        gateId: gate.gate_id,
        minAttempts: gate.attempt_count + 1,
        hash,
      };
      scheduleAcceptedStateRefresh(gate.gate_id);
    }
  }, [gate, ruleText, submitWrite, scheduleAcceptedStateRefresh]);

  const recordCondition = useCallback(async () => {
    if (!gate) return;

    const hash = await submitWrite(
      "condition",
      "record_condition",
      [gate.gate_id],
      "Condition record submitted."
    );

    if (hash) {
      pendingExpectation.current = {
        kind: "condition",
        gateId: gate.gate_id,
        hash,
      };
      scheduleAcceptedStateRefresh(gate.gate_id);
    }
  }, [gate, submitWrite, scheduleAcceptedStateRefresh]);

  const performAction = useCallback(async () => {
    if (!gate) return;

    const hash = await submitWrite(
      "action",
      "perform_action",
      [gate.gate_id],
      "Guarded action submitted."
    );

    if (hash) {
      pendingExpectation.current = {
        kind: "action",
        gateId: gate.gate_id,
        hash,
      };
      scheduleAcceptedStateRefresh(gate.gate_id);
    }
  }, [gate, submitWrite, scheduleAcceptedStateRefresh]);

  useEffect(() => {
    return () => {
      clearAutoRefreshTimer();
    };
  }, [clearAutoRefreshTimer]);

  const stateIndex = useMemo(
    () => (gate ? STATE_ORDER.indexOf(gate.state) : 0),
    [gate]
  );

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <div className="brand">
          <img
            className="project-logo"
            src="/prereqlock-logo.png"
            alt="PrereqLock"
          />
        </div>

        <div className="top-actions">
          <a
            className="network-pill"
            href={EXPLORER_URL}
            target="_blank"
            rel="noreferrer"
          >
            <span className="network-dot" />
            StudioNet
            <ExternalLink size={13} />
          </a>

          {account ? (
            <button className="wallet-button connected" onClick={disconnectWallet}>
              <Wallet size={16} />
              {short(account)}
              <LogOut size={14} />
            </button>
          ) : (
            <button
              className="wallet-button"
              onClick={connectWallet}
              disabled={connecting}
            >
              <Wallet size={16} />
              {connecting ? "Connecting…" : "Connect MetaMask"}
            </button>
          )}
        </div>
      </header>

      <main className="page">
        <section className="hero">
          <div>
            <h1>
              A prerequisite should be
              <span> required, not merely possible.</span>
            </h1>
            <p>
              PrereqLock asks validators one narrow question, then installs a
              deterministic prerequisite edge only when the rule text actually
              makes the condition necessary.
            </p>
          </div>

          <div className="hero-side">
            <div className="verdict-pair">
              <div>
                <Check size={15} />
                CONDITION_NECESSARY
              </div>
              <div>
                <X size={15} />
                CONDITION_NOT_NECESSARY
              </div>
            </div>
          </div>
        </section>

        <nav className="tabs">
          <button
            className={tab === "gate" ? "active" : ""}
            onClick={() => setTab("gate")}
          >
            <LockKeyhole size={16} />
            Gate
          </button>
          <button
            className={tab === "log" ? "active" : ""}
            onClick={() => {
              setTab("log");
              if (gate) void refreshLog();
            }}
          >
            <BookOpenText size={16} />
            Rule log
          </button>
        </nav>

        <TxBanner tx={tx} />

        {tab === "gate" ? (
          <div className="gate-layout">
            <div className="stack">
              <section className="card">
                <div className="card-head">
                  <div>
                    <span className="section-kicker">01 · CREATE</span>
                    <h2>Create a prerequisite gate</h2>
                  </div>
                  <button
                    className="ghost-button"
                    onClick={() => {
                      setName(DEMO.name);
                      setActionLabel(DEMO.action);
                      setConditionLabel(DEMO.condition);
                    }}
                  >
                    <Sparkles size={14} /> Demo values
                  </button>
                </div>

                <label>
                  Gate name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={MAX_NAME_LENGTH}
                    placeholder="Cargo departure gate"
                  />
                </label>

                <div className="two-fields">
                  <label>
                    Guarded action
                    <input
                      value={actionLabel}
                      onChange={(e) => setActionLabel(e.target.value)}
                      maxLength={MAX_LABEL_LENGTH}
                      placeholder="cargo leaving the depot"
                    />
                  </label>
                  <label>
                    Required condition
                    <input
                      value={conditionLabel}
                      onChange={(e) => setConditionLabel(e.target.value)}
                      maxLength={MAX_LABEL_LENGTH}
                      placeholder="a countersigned manifest"
                    />
                  </label>
                </div>

                <label>
                  Actor wallet
                  <input
                    className="mono-input"
                    value={actor}
                    onChange={(e) => setActor(e.target.value)}
                    placeholder="0x… wallet allowed to perform the guarded action"
                  />
                  <span className="field-help">
                    Must be different from the creator wallet. The creator records
                    the condition; this actor performs the action.
                  </span>
                </label>

                <button
                  className="primary-button"
                  onClick={createGate}
                  disabled={busy === "create"}
                >
                  {busy === "create" ? "Waiting for wallet…" : "Create gate"}
                  <ArrowRight size={16} />
                </button>
              </section>

              <section className="card">
                <div className="card-head">
                  <div>
                    <span className="section-kicker">02 · LOAD</span>
                    <h2>Open an existing gate</h2>
                  </div>
                </div>

                <div className="load-row">
                  <input
                    className="mono-input"
                    value={gateIdInput}
                    onChange={(e) => setGateIdInput(e.target.value)}
                    placeholder="64-character gate ID"
                  />
                  <button
                    className="secondary-button"
                    onClick={() => void refreshGate()}
                    disabled={loadingGate}
                  >
                    <RefreshCw
                      size={15}
                      className={loadingGate ? "spin" : ""}
                    />
                    {loadingGate ? "Loading…" : "Load accepted state"}
                  </button>
                </div>

                {gate && (
                  <div className="ownership-line">
                    <span>
                      Creator <b>{short(gate.creator, 9, 7)}</b>
                    </span>
                    <span>
                      Actor <b>{short(gate.actor, 9, 7)}</b>
                    </span>
                    <span
                      className={
                        isCreator || isActor
                          ? "ownership mine"
                          : "ownership readonly"
                      }
                    >
                      {isCreator ? (
                        <>
                          <Check size={13} /> Creator controls
                        </>
                      ) : isActor ? (
                        <>
                          <Check size={13} /> Actor controls action
                        </>
                      ) : (
                        <>
                          <Unplug size={13} /> Read only
                        </>
                      )}
                    </span>
                  </div>
                )}
              </section>

              {gate && (
                <section className="card semantic-card">
                  <div className="card-head">
                    <div>
                      <span className="section-kicker">03 · CONSENSUS</span>
                      <h2>Submit one operational rule</h2>
                    </div>
                    <span className="counter">
                      {pyLen(pyCollapse(ruleText))}/{MAX_RULE_TEXT_LENGTH}
                    </span>
                  </div>

                  <div className="semantic-labels">
                    <span>
                      <b>Condition</b> {gate.condition_label}
                    </span>
                    <ArrowRight size={15} />
                    <span>
                      <b>Action</b> {gate.action_label}
                    </span>
                  </div>

                  <textarea
                    value={ruleText}
                    onChange={(e) => setRuleText(e.target.value)}
                    maxLength={MAX_RULE_TEXT_LENGTH}
                    rows={5}
                  />

                  <div className="example-row">
                    <button
                      className="example-button"
                      onClick={() => setRuleText(DEMO.necessary)}
                    >
                      Required example
                    </button>
                    <button
                      className="example-button"
                      onClick={() => setRuleText(DEMO.alternative)}
                    >
                      Alternative-route example
                    </button>
                  </div>

                  <button
                    className="primary-button"
                    onClick={submitRule}
                    disabled={!isCreator || gate.edge_installed || busy === "rule"}
                  >
                    <Route size={16} />
                    {gate.edge_installed
                      ? "Prerequisite already installed"
                      : busy === "rule"
                      ? "Waiting for wallet…"
                      : "Submit for validator consensus"}
                  </button>
                </section>
              )}
            </div>

            <div className="stack sticky-stack">
              <section className="card state-card">
                <div className="card-head">
                  <div>
                    <span className="section-kicker">STATE MACHINE</span>
                    <h2>{gate ? gate.name : "No gate loaded"}</h2>
                  </div>
                  {gate && (
                    <button
                      className="icon-button"
                      title="Refresh accepted state"
                      onClick={() => void refreshGate(gate.gate_id)}
                      disabled={loadingGate}
                    >
                      <RefreshCw
                        size={16}
                        className={loadingGate ? "spin" : ""}
                      />
                    </button>
                  )}
                </div>

                <StateMachine current={gate?.state ?? "LOCKED"} loaded={!!gate} />

                {gate ? (
                  <>
                    <div className="state-grid">
                      <StateFact
                        label="Prerequisite edge"
                        value={gate.edge_installed ? "Installed" : "Not installed"}
                        positive={gate.edge_installed}
                      />
                      <StateFact
                        label="Condition"
                        value={gate.condition_met ? "Recorded" : "Not recorded"}
                        positive={gate.condition_met}
                      />
                      <StateFact
                        label="Action"
                        value={gate.action_done ? "Done" : "Not done"}
                        positive={gate.action_done}
                      />
                      <StateFact
                        label="Rule attempts"
                        value={String(gate.attempt_count)}
                      />
                    </div>

                    <div className="action-zone">
                      <button
                        className="secondary-button"
                        onClick={recordCondition}
                        disabled={
                          !isActor ||
                          !gate.edge_installed ||
                          gate.condition_met ||
                          gate.action_done ||
                          busy === "condition"
                        }
                      >
                        <FileKey2 size={15} />
                        {gate.condition_met
                          ? "Condition recorded"
                          : "Record condition"}
                      </button>

                      <button
                        className="primary-button"
                        onClick={performAction}
                        disabled={
                          !isCreator ||
                          !gate.edge_installed ||
                          !gate.condition_met ||
                          gate.action_done ||
                          busy === "action"
                        }
                      >
                        <LockKeyhole size={15} />
                        {gate.action_done ? "Action complete" : "Perform action"}
                      </button>
                    </div>

                    <p className="microcopy">
                      The creator records the condition; only the separate actor
                      can perform the guarded action. Accepted state is checked
                      first. After timeout, the dApp reads the leader receipt only
                      to surface a finalized rollback.
                    </p>
                  </>
                ) : (
                  <div className="empty-state">
                    <Waypoints size={30} />
                    <p>
                      Create a gate or paste a gate ID to inspect the on-chain
                      state machine.
                    </p>
                  </div>
                )}
              </section>

              <section className="card explainer-card">
                <span className="section-kicker">WHAT THE AI DECIDES</span>
                <h3>One semantic bit. Nothing else.</h3>
                <p>
                  Validators decide whether the nominated condition is actually
                  required before the nominated action is permitted.
                </p>
                <div className="explain-row good">
                  <Check size={15} />
                  Necessary → install prerequisite edge
                </div>
                <div className="explain-row neutral">
                  <X size={15} />
                  Not necessary → remain locked
                </div>
              </section>
            </div>
          </div>
        ) : (
          <section className="card log-card">
            <div className="card-head">
              <div>
                <span className="section-kicker">RULE LOG</span>
                <h2>Immutable semantic attempts</h2>
              </div>
              <button
                className="secondary-button"
                onClick={() => void refreshLog()}
                disabled={loadingLog}
              >
                <RefreshCw size={15} className={loadingLog ? "spin" : ""} />
                Refresh
              </button>
            </div>

            <div className="log-meta">
              <span>Gate</span>
              <code>{gate?.gate_id ?? (normalizeGateId(gateIdInput) || "—")}</code>
            </div>

            {attempts.length ? (
              <div className="attempt-list">
                {attempts.map((item) => (
                  <div className="attempt-row" key={item.rule_id}>
                    <div className="attempt-number">#{item.attempt_number}</div>
                    <div className="attempt-main">
                      <strong
                        className={
                          item.installs_edge ? "verdict positive" : "verdict"
                        }
                      >
                        {item.verdict}
                      </strong>
                      <span>
                        Rule ID <code>{short(item.rule_id, 12, 10)}</code>
                      </span>
                    </div>
                    <button
                      className="icon-button"
                      title="Copy rule ID"
                      onClick={() => navigator.clipboard.writeText(item.rule_id)}
                    >
                      <Clipboard size={15} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state compact">
                <BookOpenText size={28} />
                <p>
                  No accepted attempts loaded. Load a gate, then refresh this
                  log after consensus finalizes.
                </p>
              </div>
            )}
          </section>
        )}
      </main>

      <footer>
        <div>
          <Waypoints size={15} />
          PrereqLock
        </div>
        <span>
          Contract state is authoritative · StudioNet · Accepted-state matching
        </span>
      </footer>
    </div>
  );
}

function TxBanner({ tx }: { tx: TxUiState }) {
  if (tx.kind === "idle") return null;

  return (
    <div className={`tx-banner ${tx.kind}`}>
      <div>
        {tx.kind === "signing" && <Wallet size={16} />}
        {tx.kind === "submitted" && <Check size={16} />}
        {tx.kind === "error" && <X size={16} />}
        <span>{tx.message}</span>
      </div>
      {tx.kind === "submitted" && (
        <a
          href={`${EXPLORER_BASE}/tx/${tx.hash}`}
          target="_blank"
          rel="noreferrer"
          title={tx.hash}
        >
          <code>{short(tx.hash, 12, 10)}</code>
          <ExternalLink size={13} />
        </a>
      )}
    </div>
  );
}

function StateMachine({
  current,
  loaded,
}: {
  current: GateState;
  loaded: boolean;
}) {
  const currentIndex = STATE_ORDER.indexOf(current);

  return (
    <div className={`state-machine ${loaded ? "" : "muted"}`}>
      {STATE_ORDER.map((state, index) => (
        <div className="state-node-wrap" key={state}>
          <div
            className={[
              "state-node",
              index < currentIndex ? "passed" : "",
              index === currentIndex && loaded ? "current" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {index < currentIndex ? <Check size={14} /> : index + 1}
          </div>
          <span className={index === currentIndex && loaded ? "current-label" : ""}>
            {state}
          </span>
          {index < STATE_ORDER.length - 1 && <div className="state-line" />}
        </div>
      ))}
    </div>
  );
}

function StateFact({
  label,
  value,
  positive = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="state-fact">
      <span>{label}</span>
      <strong className={positive ? "positive-text" : ""}>{value}</strong>
    </div>
  );
}

export default App;
