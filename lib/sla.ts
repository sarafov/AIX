import type { FteImport, StaffingBody } from './staffing';

export interface PlanningSession extends StaffingBody { warnings: string[]; fteImport: FteImport | null; rosterSource: string }
export interface SlaRow { role: string; talent: string; fte: number; in_scope: string; out_scope: string }
export interface SlaSeed { project: string; rows: SlaRow[]; tasks: Record<string, string[]>; warnings: string[] }
export interface SlaDraft {
  title: string; project_name: string; chapter: string; period: string; owner_pm: string;
  background: string; objectives: string; engagement: string; assignment_terms: string;
  deliverable_notes: string; rows: SlaRow[]; intake: string; communication: string;
  definition_of_done: string; escalation: string; sources: string[]; warnings: string[];
}
export async function slaRequest<T>(path: string, init: RequestInit): Promise<T> {
  const r = await fetch(`/api/py/sla/${path}`, init);
  if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(typeof b.detail === 'string' ? b.detail : JSON.stringify(b.detail ?? r.status)); }
  return r.json();
}
