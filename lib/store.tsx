"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as api from "./api";
import type { PlanningSession, SlaDraft } from "./sla";
import type {
  Catalog,
  Parameters,
  ProgressEvent,
  ProjectInfo,
  ProviderConfig,
  RunResult,
  WbsPreview,
} from "./types";

export const DEFAULT_PARAMETERS: Parameters = {
  hours_per_day: 8,
  days_per_month: 20,
  phm: 15,
  support_factor: 0.25,
  tolerance: 0.15,
  duration_override_months: null,
  holidays: [],
  use_case_weights: { Simple: 5, Average: 10, Complex: 15 },
  actor_weights: { Simple: 1, Average: 2, Complex: 3 },
};

export const DEFAULT_PROVIDER: ProviderConfig = {
  provider: "google",
  model: "gemini-3.8-flash",
  base_url: null,
  api_version: null,
  temperature: 0,
  mask_pii: true,
  send_temperature: true,
  max_tokens: 8192,
  extra_headers: {},
  structured_method: "auto",
};

export interface TeamInput {
  requested: string;
  existing: string;
  reference: string;
}

/** Values filled from the documents, per role and field, with the quote they came from. */
export type TeamAuto = Record<string, Partial<Record<"requested" | "existing", { value: string; evidence: string }>>>;

export type RunStatus = "idle" | "running" | "done" | "error";

export interface Files {
  wbs: File[];
  request: File[];
  supporting: File[];
}

/** Limits that match the API: files per field and total upload size. */
export const MAX_FILES_PER_FIELD = 5;
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

interface Store {
  planningSession: PlanningSession | null;
  setPlanningSession: (value: PlanningSession) => void;
  slaDraft: SlaDraft | null;
  setSlaDraft: (value: SlaDraft) => void;
  provider: ProviderConfig;
  setProvider: (p: ProviderConfig) => void;
  apiKey: string;
  setApiKey: (k: string) => void;
  catalog: Catalog | null;
  defaultCatalog: Catalog | null;
  catalogSource: string;
  setCatalog: (c: Catalog, source: string) => void;
  resetCatalog: () => void;
  project: ProjectInfo;
  setProject: (p: ProjectInfo) => void;
  parameters: Parameters;
  setParameters: (p: Parameters) => void;
  team: Record<string, TeamInput>;
  setTeam: (t: Record<string, TeamInput>) => void;
  teamAuto: TeamAuto;
  setTeamAuto: (t: TeamAuto) => void;
  aiEnabled: boolean;
  setAiEnabled: (v: boolean) => void;
  aiTools: string;
  setAiTools: (v: string) => void;
  files: Files;
  setFiles: (f: Files) => void;
  preview: WbsPreview | null;
  setPreview: (p: WbsPreview | null) => void;
  status: RunStatus;
  events: ProgressEvent[];
  error: string | null;
  startedAt: number | null;
  endedAt: number | null;
  modelCalls: number;
  demo: boolean;
  run: RunResult | null;
  setRun: (r: RunResult) => void;
  start: (demo: boolean) => Promise<void>;
  cancel: () => void;
  busy: boolean;
  update: (r: RunResult) => Promise<void>;
  reclassify: (requests: { item_id: string; role: string; reason: string }[]) => Promise<void>;
  exportExcel: () => Promise<void>;
  notice: string | null;
  setNotice: (n: string | null) => void;
  teamView: string;
  setTeamView: (v: string) => void;
}

const Context = createContext<Store | null>(null);

/**
 * Demo runs finish in well under a second, which hides how the agents hand
 * work to each other. The demo replays the real events with short pauses so
 * each step is visible. Runs with a real model are never delayed.
 */
function demoDelay(event: Record<string, unknown>, seen: Set<string>): number {
  if (event.type !== "progress") return 700;
  const agent = String(event.agent);
  const first = !seen.has(agent);
  seen.add(agent);
  const jitter = Math.random() * 700;
  if (event.status === "done") return 1300 + jitter;
  return first ? 450 : 1900 + jitter;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function toNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [planningSession, setPlanningSession] = useState<PlanningSession | null>(null);
  const [slaDraft, setSlaDraft] = useState<SlaDraft | null>(null);
  const [provider, setProvider] = useState<ProviderConfig>(DEFAULT_PROVIDER);
  const [apiKey, setApiKey] = useState("");
  const [defaultCatalog, setDefaultCatalog] = useState<Catalog | null>(null);
  const [catalog, setCatalogState] = useState<Catalog | null>(null);
  const [catalogSource, setCatalogSource] = useState("bawaan");
  const [project, setProject] = useState<ProjectInfo>({
    name: "",
    start: null,
    end: null,
    scope: "data",
    context: "",
    reference: "",
  });
  const [parameters, setParameters] = useState<Parameters>(DEFAULT_PARAMETERS);
  const [team, setTeam] = useState<Record<string, TeamInput>>({});
  const [teamAuto, setTeamAuto] = useState<TeamAuto>({});
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiTools, setAiTools] = useState("");
  const [files, setFiles] = useState<Files>({ wbs: [], request: [], supporting: [] });
  const [preview, setPreview] = useState<WbsPreview | null>(null);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [modelCalls, setModelCalls] = useState(0);
  const [demo, setDemo] = useState(false);
  const [run, setRun] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [teamView, setTeamView] = useState("all");
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    api
      .fetchCatalog()
      .then((c) => {
        setDefaultCatalog(c);
        setCatalogState(c);
      })
      .catch(() => setNotice("Katalog bawaan gagal dimuat. Periksa koneksi ke API."));
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (run || status === "running") {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [run, status]);

  const setCatalog = useCallback((c: Catalog, source: string) => {
    setCatalogState(c);
    setCatalogSource(source);
  }, []);

  const resetCatalog = useCallback(() => {
    if (defaultCatalog) setCatalogState(defaultCatalog);
    setCatalogSource("bawaan");
  }, [defaultCatalog]);

  const start = useCallback(
    async (useDemo: boolean) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setStatus("running");
      setEvents([]);
      setError(null);
      setDemo(useDemo);
      setTeamView("all");
      setStartedAt(Date.now());
      setEndedAt(null);
      setModelCalls(0);
      const role_inputs = Object.entries(team).map(([role, t]) => ({
        role,
        requested_fte: toNumber(t.requested),
        existing_fte: toNumber(t.existing) ?? 0,
        reference_fte: toNumber(t.reference),
      }));
      const settings = {
        project: useDemo ? { ...project, name: "", start: null, end: null, reference: "" } : project,
        parameters,
        role_inputs,
        ai_enabled: aiEnabled,
        ai_tools: aiTools
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        provider,
        demo: useDemo,
        catalog,
      };
      const handle = (event: Record<string, unknown>) => {
        if (event.type === "progress") {
          setEvents((prev) => [...prev, { ...(event as unknown as ProgressEvent), at: Date.now() }]);
        } else if (event.type === "heartbeat") {
          setModelCalls(Number(event.calls) || 0);
        } else if (event.type === "result") {
          setRun(event.run as RunResult);
          setStatus("done");
          setEndedAt(Date.now());
        } else if (event.type === "error") {
          setError(String(event.message));
          setStatus("error");
          setEndedAt(Date.now());
        }
      };
      const queue: Record<string, unknown>[] = [];
      try {
        await api.startRun(
          settings,
          useDemo ? {} : files,
          useDemo ? "" : apiKey,
          useDemo ? (event) => queue.push(event) : handle,
          controller.signal,
        );
        const seen = new Set<string>();
        for (const event of queue) {
          await wait(demoDelay(event, seen), controller.signal);
          handle(event);
        }
      } catch (err) {
        setEndedAt(Date.now());
        if (controller.signal.aborted) {
          setStatus("idle");
          setError("Run dibatalkan.");
        } else {
          setStatus("error");
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    },
    [aiEnabled, aiTools, apiKey, catalog, files, parameters, project, provider, team],
  );

  const cancel = useCallback(() => abort.current?.abort(), []);

  const update = useCallback(
    async (next: RunResult) => {
      setRun(next);
      setBusy(true);
      try {
        setRun(await api.recalculate(next, catalog));
      } catch (err) {
        setNotice(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [catalog],
  );

  const reclassify = useCallback(
    async (requests: { item_id: string; role: string; reason: string }[]) => {
      if (!run) return;
      setBusy(true);
      try {
        setRun(await api.reclassify(run, catalog, requests, provider, demo ? "" : apiKey, demo));
        setNotice(`${requests.length} baris dinilai ulang oleh Estimator Agent.`);
      } catch (err) {
        setNotice(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [apiKey, catalog, demo, provider, run],
  );

  const exportExcel = useCallback(async () => {
    if (!run) return;
    setBusy(true);
    try {
      await api.downloadExcel(run, catalog);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [catalog, run]);

  const value = useMemo<Store>(
    () => ({
      planningSession, setPlanningSession, slaDraft, setSlaDraft,
      provider, setProvider, apiKey, setApiKey, catalog, defaultCatalog, catalogSource, setCatalog,
      resetCatalog, project, setProject, parameters, setParameters, team, setTeam, teamAuto, setTeamAuto, aiEnabled,
      setAiEnabled, aiTools, setAiTools, files, setFiles, preview, setPreview, status, events,
      error, startedAt, endedAt, modelCalls, demo, run, setRun, start, cancel, busy, update, reclassify, exportExcel,
      notice, setNotice, teamView, setTeamView,
    }),
    [
      planningSession, slaDraft,
      provider, apiKey, catalog, defaultCatalog, catalogSource, setCatalog, resetCatalog, project,
      parameters, team, teamAuto, aiEnabled, aiTools, files, preview, status, events, error, startedAt, endedAt,
      modelCalls, demo,
      run, start, cancel, busy, update, reclassify, exportExcel, notice, teamView,
    ],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useStore(): Store {
  const store = useContext(Context);
  if (!store) throw new Error("useStore must be used inside StoreProvider");
  return store;
}
