import type { Catalog, RunResult } from './types';

export interface Talent {
  id: string; name: string; primary_role: string; preferred_roles: string; project: string;
  current_fte: number | null; capacity_fte: number; skills: Record<string, number>;
}
export interface FteImport {
  columns: string[]; loaded: number; missing: number; formulas_without_cached_value: number;
}
export interface Requirement {
  item_id: string; item_name: string; role: string; pillar: string; skill: string;
  classification: 'Simple' | 'Average' | 'Complex'; weight: number; target: number; reason: string;
}
export interface TalentProject {
  name: string; source: string; method: string; requirements: Requirement[];
  demands: { role: string; fte: number | null; estimates?: Record<string, number | null> }[]; warnings: string[];
}
export interface Assignment { talent_id: string; role: string; fte: number; reason: string }
export interface StaffingBody { project: TalentProject; talents: Talent[]; assignments: Assignment[] }
export interface Detail { pillar: string; skill: string; level: number | null; target: number; weight: number; matched: boolean; meets_target: boolean }
export interface Candidate {
  talent_id: string; name: string; primary_role: string; preferred_roles: string; project: string;
  score: number | null; skill_score: number; coverage_score: number; capacity_score: number;
  coverage_percent: number; current_fte: number | null; capacity_fte: number;
  allocated_fte: number; available_fte: number | null; provisional: boolean; details: Detail[];
}
export interface Ranking {
  roles: { role: string; required_fte: number | null; assigned_fte: number; remaining_fte: number | null; candidates: Candidate[]; skills: number }[];
  alerts: string[]; formula: string; scale: Record<string, string>;
}
async function request<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(`/api/py/talent/${url}`, init);
  if (!response.ok) { const b = await response.json().catch(() => ({})); throw new Error(typeof b.detail === 'string' ? b.detail : JSON.stringify(b.detail ?? response.status)); }
  return response.json();
}
export async function importRoster(file: File, catalog: Catalog | null): Promise<{ talents: Talent[]; warnings: string[]; matched_skills: number; fte_import: FteImport }> {
  const body = new FormData(); body.append('file', file); if (catalog) body.append('catalog', JSON.stringify(catalog));
  return request('parse', { method: 'POST', body });
}
export async function importProject(file: File): Promise<TalentProject> {
  const body = new FormData(); body.append('file', file); return request('project', { method: 'POST', body });
}
export function fromRun(run: RunResult, method: string): Promise<TalentProject> {
  return request('from-run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ run, method }) });
}
export function rank(body: StaffingBody): Promise<Ranking> {
  return request('recommend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
export async function exportPlan(body: StaffingBody): Promise<void> {
  const response = await fetch('/api/py/talent/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error('Export failed. Check project, talent, and assignment inputs.');
  download(await response.blob(), 'Talent_Assignment_Plan.xlsx');
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
