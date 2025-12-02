import { spawn, type ChildProcess } from "node:child_process";

type LocalServerStatus = "idle" | "starting" | "running" | "stopping" | "error";

export type LocalAsrStatusPayload = {
  status: LocalServerStatus;
  pid: number | null;
  lastActive: number | null;
  expiresAt: number | null;
  error: string | null;
};

export type LocalAsrEvent =
  | ({ type: "status" } & LocalAsrStatusPayload)
  | { type: "idle-timeout"; at: number }
  | { type: "activity"; lastActive: number; expiresAt: number | null };

export const LOCAL_ASR_PORT = process.env.LOCAL_ASR_PORT || "8000";

let child: ChildProcess | null = null;
let status: LocalServerStatus = "idle";
let lastError: string | null = null;
let lastActive: number | null = null;
let expiresAt: number | null = null;
let idleTimer: NodeJS.Timeout | null = null;
const subscribers = new Set<(event: LocalAsrEvent) => void>();
const idleTimeoutMs = 10 * 60 * 1000;

function emit(event: LocalAsrEvent) {
  subscribers.forEach((subscriber) => {
    try {
      subscriber(event);
    } catch {
      // ignore subscriber errors
    }
  });
}

function scheduleIdleTimeout() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (!lastActive || status !== "running") {
    expiresAt = null;
    emitStatus();
    return;
  }
  const now = Date.now();
  const target = lastActive + idleTimeoutMs;
  const delay = Math.max(target - now, 0);
  expiresAt = target;

  idleTimer = setTimeout(() => {
    const at = Date.now();
    emit({ type: "idle-timeout", at });
    void stopLocalAsrServer("idle-timeout");
  }, delay);
  emitStatus();
}

function emitStatus() {
  emit({
    type: "status",
    ...getLocalAsrStatus(),
  });
}

export function touchLocalAsrActivity() {
  lastActive = Date.now();
  scheduleIdleTimeout();
  emit({
    type: "activity",
    lastActive,
    expiresAt,
  });
}

export function getLocalAsrStatus(): LocalAsrStatusPayload {
  return {
    status,
    pid: child?.pid ?? null,
    lastActive,
    expiresAt,
    error: lastError,
  };
}

export function subscribeLocalAsrEvents(subscriber: (event: LocalAsrEvent) => void): () => void {
  subscribers.add(subscriber);
  subscriber({
    type: "status",
    ...getLocalAsrStatus(),
  });
  return () => {
    subscribers.delete(subscriber);
  };
}

async function waitForHealth(url: string) {
  const maxAttempts = 40;
  const delayMs = 1500;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (status !== "starting") return;
    try {
      const response = await fetch(url);
      if (response.ok) {
        status = "running";
        lastError = null;
        touchLocalAsrActivity();
        emitStatus();
        return;
      }
    } catch {
      // ignore errors while waiting
    }

    await new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }

  if (status === "starting") {
    lastError = "Không thể khởi động server Python trong thời gian cho phép.";
    status = "error";
    emitStatus();
    const current = child;
    if (current) {
      current.kill();
    }
  }
}

export async function startLocalAsrServer(): Promise<LocalAsrStatusPayload> {
  if (status === "running" && child?.pid) {
    return getLocalAsrStatus();
  }

  if (status === "starting") {
    return getLocalAsrStatus();
  }

  const pythonCmd = process.env.LOCAL_ASR_PYTHON_CMD || "python";
  const port = LOCAL_ASR_PORT;

  status = "starting";
  lastError = null;
  emitStatus();

  child = spawn(
    pythonCmd,
    ["-m", "uvicorn", "src.local_asr.transcribe_server:app", "--host", "127.0.0.1", "--port", port],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "ignore",
    },
  );

  child.on("exit", (code, signal) => {
    const previousStatus = status;
    child = null;
    lastActive = null;
    expiresAt = null;
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }

    if (previousStatus === "starting" || previousStatus === "running") {
      const reason =
        code !== null
          ? `code ${code}`
          : signal
            ? `signal ${signal}`
            : "unknown";
      const message =
        lastError ??
        `Server Python đã dừng bất ngờ (${reason}). Kiểm tra LOCAL_ASR_PYTHON_CMD và các thư viện fastapi, uvicorn, transformers, torch, srt.`;
      lastError = message;
      status = "error";
      // eslint-disable-next-line no-console
      console.error("[local-asr] python-exit", { code, signal, previousStatus });
    } else {
      status = "idle";
    }

    emitStatus();
  });

  child.on("error", () => {
    lastError = "Lỗi khi khởi động process Python.";
    status = "error";
    emitStatus();
  });

  const healthUrl = `http://127.0.0.1:${port}/health`;
  void waitForHealth(healthUrl);

  return getLocalAsrStatus();
}

export async function stopLocalAsrServer(reason?: string): Promise<LocalAsrStatusPayload> {
  if (!child) {
    status = "idle";
    lastError = reason ? `Server đã dừng (${reason}).` : null;
    emitStatus();
    return getLocalAsrStatus();
  }

  status = "stopping";
  emitStatus();

  const current = child;
  if (current) {
    current.kill();
  }

  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  lastError = reason ? `Server đã dừng (${reason}).` : null;

  return getLocalAsrStatus();
}
