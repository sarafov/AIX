// Types mirroring the Pydantic models in src/talent_estimation/domain/models.py.

export type Classification = "Simple" | "Average" | "Complex";
export type Involvement = "Utama" | "Pendukung";
export type Level = "Tinggi" | "Sedang" | "Rendah";
export type Scope = "all" | "data" | "design";

export interface Parameters {
  hours_per_day: number;
  days_per_month: number;
  phm: number;
  support_factor: number;
  tolerance: number;
  duration_override_months: number | null;
  holidays: string[];
  use_case_weights: Record<Classification, number>;
  actor_weights: Record<Classification, number>;
}

export interface ProjectInfo {
  name: string;
  start: string | null;
  end: string | null;
  scope: Scope;
  context: string;
  reference: string;
}

export interface RoleInput {
  role: string;
  requested_fte: number | null;
  existing_fte: number;
  reference_fte: number | null;
}

export interface CapabilityNeed {
  pillar: string;
  skill: string;
  reason: string;
}

export interface BreakdownRow {
  item_id: string;
  item_name: string;
  description: string;
  role_hint: string;
  start: string | null;
  end: string | null;
  workdays: number | null;
  group: string;
  role: string;
  involvement: Involvement;
  quantity: number;
  steps: number | null;
  classification: Classification;
  classification_reason: string;
  allocation_fte: number;
  allocation_reason: string;
  needs_review: boolean;
  source: "wbs" | "additional";
  capabilities: CapabilityNeed[];
}

export interface RoleEstimate {
  role: string;
  rows: number;
  uaw: number;
  uucw: number;
  uucp: number;
  tcf: number;
  ef: number;
  ucp: number;
  ucp_hours: number;
  ucp_fte: number;
  bu_person_days: number;
  bu_hours: number;
  bu_fte: number;
  ucp_peak_fte: number;
  bu_peak_fte: number;
}

export interface MonthlyFte {
  month: string;
  capacity_days: number;
  ucp: Record<string, number>;
  bottom_up: Record<string, number>;
}

export interface Comparison {
  role: string;
  requested_fte: number | null;
  existing_fte: number;
  reference_fte: number | null;
  ucp_fte: number;
  bu_fte: number;
  ucp_additional_fte: number;
  bu_additional_fte: number;
  divergence: number | null;
  ucp_vs_requested: string | null;
  bu_vs_requested: string | null;
  conclusion: string;
}

export interface Finding {
  kind: string;
  message: string;
  item_id: string | null;
  role: string | null;
  severity: Level;
  source: string;
}

export interface AiTask {
  item_id: string;
  role: string;
  task: string;
  weight: number;
  pillar: string;
  skill: string;
  category: string;
  saving: number;
  confidence: Level;
  prerequisite: string;
  reason: string;
}

export interface AiAssessment {
  role: string;
  baseline_person_days: number;
  saved_person_days: number;
  saving_share: number;
  ucp_fte: number;
  ucp_fte_assisted: number;
  bu_fte: number;
  bu_fte_assisted: number;
  top_skills: string[];
}

export interface TraceEvent {
  agent: string;
  action: string;
  detail: string;
}

export interface RunResult {
  project: ProjectInfo;
  parameters: Parameters;
  roles: string[];
  role_inputs: RoleInput[];
  items: unknown[];
  breakdown: BreakdownRow[];
  factors: unknown[];
  estimates: RoleEstimate[];
  monthly: MonthlyFte[];
  comparisons: Comparison[];
  findings: Finding[];
  ai_enabled: boolean;
  ai_tasks: AiTask[];
  ai_summary: AiAssessment[];
  message_draft: string;
  trace: TraceEvent[];
  approved: boolean;
}

export interface RoleProfile {
  code: string;
  name: string;
  team: string;
  aliases: string[];
  summary: string;
  capability_areas: Record<string, string>;
  in_scope: string;
  out_of_scope: string;
  primary_keywords: string;
  usually_supporting_on: string;
  substitutes: string;
  pillars: Record<string, string[]>;
  skill_definitions?: Record<string, string>;
}

export interface AiCategory {
  key: string;
  label: string;
  min_saving: number;
  max_saving: number;
  default_saving: number;
  examples: string;
}

export interface Catalog {
  version: string;
  teams: Record<string, { label: string; roles: string[] }>;
  roles: Record<string, RoleProfile>;
  competency_scale: Record<string, string>;
  rules: { id: string; title: string; text: string }[];
  allocation_guide: Record<string, string>[];
  classification_rubric: Record<string, string>;
  actor_rubric: Record<string, string>;
  ai_categories: AiCategory[];
}

export type Provider = "google" | "anthropic" | "openai" | "azure" | "openai_compatible";

export interface ProviderConfig {
  provider: Provider;
  model: string;
  base_url: string | null;
  api_version: string | null;
  temperature: number;
  mask_pii: boolean;
  send_temperature: boolean;
  max_tokens: number | null;
  extra_headers: Record<string, string>;
  structured_method: "auto" | "native" | "function_calling" | "json_mode" | "prompt";
}

export interface ExtractedAmount {
  fte: number;
  evidence: string;
}

export interface ExtractResult {
  method: "model" | "aturan";
  project_name: string;
  period_start: string | null;
  period_end: string | null;
  requested: Record<string, ExtractedAmount>;
  existing: Record<string, ExtractedAmount>;
}

export interface ConnectionResult {
  reply: string;
  max_tokens: number | null;
  structured_method: ProviderConfig["structured_method"];
  send_temperature: boolean;
  adjustments: string[];
}

export interface ProgressEvent {
  type: "progress";
  agent: string;
  status: "running" | "done" | "error" | "skipped";
  message: string;
  at?: number;
}

export interface WbsPreview {
  sheet: string;
  items: number;
  rows: number;
  start: string | null;
  end: string | null;
  warnings: string[];
  legend_size: number;
  files: { name: string; sheet: string; items: number; start: string | null; end: string | null }[];
}
