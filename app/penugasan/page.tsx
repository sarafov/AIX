"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Download, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button, Card, PageHeader, StatusBadge, inputClass } from '@/components/ui';
import { useStore } from '@/lib/store';
import { download, exportPlan, fromRun, importProject, importRoster, rank } from '@/lib/staffing';
import type { Assignment, Candidate, Ranking, Requirement, Talent, TalentProject } from '@/lib/staffing';

const roleNames: Record<string, string> = { DE: 'Data Engineer', DA: 'Data Analyst', DS: 'Data Scientist', AI: 'Engineer' };
const steps = ['Data & FTE', 'Kebutuhan Skill', 'Rekomendasi & Penugasan'];
const scale = ['Tidak ada pengalaman', 'Dasar', 'Menengah', 'Mahir', 'Ahli'];
const fmt = (n: number | null | undefined) => n == null ? 'Belum diisi' : n.toFixed(2);

export default function StaffingPage() {
  const { run, catalog } = useStore();
  const [talents, setTalents] = useState<Talent[]>([]);
  const [project, setProject] = useState<TalentProject | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [role, setRole] = useState('');
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState('bottom_up_peak');
  const [inspect, setInspect] = useState<string | null>(null);
  const [addSkill, setAddSkill] = useState('');
  const [newItem, setNewItem] = useState('');
  const [newRole, setNewRole] = useState('DE');
  const generation = useRef(0);
  const body = useMemo(() => project ? { project, talents, assignments } : null, [project, talents, assignments]);
  const bodyRef = useRef(body); bodyRef.current = body;
  const [rankedBody, setRankedBody] = useState<typeof body>(null);
  const fresh = rankedBody === body && !!ranking;
  const report = ranking?.roles.find(r => r.role === role) ?? ranking?.roles[0];
  const selectedDetail = report?.candidates.find(c => c.talent_id === inspect);
  const choices = useMemo(() => Object.entries(catalog?.roles ?? {}).flatMap(([code, p]) => Object.entries(p.pillars).flatMap(([pillar, skills]) => skills.map(skill => ({ role: code, pillar, skill })))), [catalog]);

  async function perform(action: () => Promise<void>) { setBusy(true); setError(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }
  function changeProject(p: TalentProject) { setProject(p); setAssignments([]); setRanking(null); setRankedBody(null); setRole(p.demands[0]?.role ?? p.requirements[0]?.role ?? ''); }
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => { if (talents.length || project) e.preventDefault(); };
    window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload);
  }, [talents.length, project]);
  useEffect(() => {
    if (!body || !talents.length || step !== 2) return;
    const id = ++generation.current;
    const timer = setTimeout(() => {
      rank(body).then(r => { if (id === generation.current && bodyRef.current === body) { setRanking(r); setRankedBody(body); setError(''); } }).catch(e => { if (id === generation.current) setError(String(e.message)); });
    }, 250);
    return () => { clearTimeout(timer); generation.current++; };
  }, [body, step, talents.length]);

  function fileHandler(action: (file: File) => Promise<void>) {
    return (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; if (file.size > 4 * 1024 * 1024) { setError('Ukuran file maksimum 4 MB.'); return; } void perform(() => action(file)); };
  }
  function select(c: Candidate) {
    if (!report || !fresh) return;
    const fte = Math.min(report.remaining_fte ?? 1, c.available_fte ?? 1, 1);
    setAssignments([...assignments, { role: report.role, talent_id: c.talent_id, fte: Math.max(0.01, fte), reason: '' }]);
  }
  function updateRequirement(index: number, patch: Partial<Requirement>) {
    if (!project) return; setProject({ ...project, requirements: project.requirements.map((r, i) => i === index ? { ...r, ...patch } : r) });
  }
  const searched = (t: { name: string; primary_role: string }) => `${t.name} ${t.primary_role}`.toLowerCase().includes(query.toLowerCase());

  return <>
    <PageHeader title="Pemetaan & Penugasan Talent" description="Lanjutkan estimasi proyek menjadi rekomendasi berbasis skill. Anda menentukan talent dan alokasi akhirnya."
      actions={<Button variant="secondary" disabled={!body || busy} onClick={() => body && download(new Blob([JSON.stringify({ version: 1, ...body, warnings }, null, 2)], { type: 'application/json' }), 'Talent_Planning_Session.json')}><Download size={16} /> Simpan sesi</Button>} />
    <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Langkah pemetaan">{steps.map((s, i) => <button key={s} role="tab" aria-selected={step === i} disabled={i > 0 && (!project || !talents.length)} onClick={() => { setStep(i); setQuery(''); }} className={`rounded-lg px-4 py-2 text-sm ${step === i ? 'bg-accent-600 text-white' : 'border border-line bg-white text-muted'} disabled:opacity-40`}>{i + 1}. {s}</button>)}</div>
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {busy && <p role="status" className="mb-4 flex items-center gap-2 text-sm"><Loader2 className="animate-spin" size={16} /> Membaca dan memvalidasi data…</p>}
    {step === 0 && <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="1. Hasil estimasi proyek" description="Gunakan hasil saat ini, atau unggah Validasi_Talent_proyek.xlsx.">
          <div className="space-y-3">
            <select aria-label="Metode kebutuhan FTE" className={inputClass} value={method} onChange={e => setMethod(e.target.value)}><option value="bottom_up_peak">Bottom-up • FTE puncak</option><option value="ucp_peak">UCP • FTE puncak</option><option value="bottom_up_average">Bottom-up • FTE rata-rata</option><option value="ucp_average">UCP • FTE rata-rata</option></select>
            <Button disabled={!run || busy} onClick={() => perform(async () => { if (run) changeProject(await fromRun(run, method)); })}>Gunakan hasil estimasi saat ini <ArrowRight size={15} /></Button>
            {!run && <p className="text-xs text-muted">Belum ada hasil aktif. <Link className="text-accent-700 underline" href="/validasi">Mulai estimasi baru</Link> atau unggah workbook di bawah.</p>}
            <label className="block text-sm font-medium">Unggah workbook validasi<input className={`${inputClass} mt-2`} aria-label="Workbook validasi proyek" type="file" accept=".xlsx" disabled={busy} onChange={fileHandler(async f => { const p = await importProject(f); p.source = f.name; changeProject(p); })} /></label>
            <p className="text-xs text-muted">Import Excel memakai Bottom-up FTE puncak dari Ringkasan. Capability dan klasifikasi dibaca dari Capability dan Breakdown_WBS. Kebutuhan FTE dapat dikoreksi di langkah 2.</p>
            {project && <StatusBadge tone="good">{project.requirements.length} kebutuhan skill • {project.demands.length} role</StatusBadge>}
          </div>
        </Card>
        <Card title="2. Data talent" description="Unggah Talent Capability Breakdown.xlsx. Semua talent dipertimbangkan untuk semua role.">
          <label className="block text-sm font-medium">Workbook profil talent<input aria-label="Workbook talent capability" className={`${inputClass} mt-2`} type="file" accept=".xlsx" disabled={busy} onChange={fileHandler(async f => { const r = await importRoster(f, catalog); setTalents(r.talents); setWarnings(r.warnings); setAssignments([]); setRanking(null); })} /></label>
          <p className="mt-3 text-xs text-muted">Kolom FTE atau Current FTE dibaca sebagai beban kerja saat ini. Skala skill: 1 tidak ada pengalaman, 2 dasar, 3 menengah, 4 mahir, 5 ahli. Current FTE kosong berarti belum diketahui; bukan 0.</p>
          {talents.length > 0 && <p className="mt-4 flex items-center gap-2 text-sm text-emerald-800"><Check size={16} /> {talents.length} talent berhasil dimuat</p>}
          <label className="mt-5 block text-xs text-muted">Pulihkan sesi tersimpan<input className={`${inputClass} mt-2`} aria-label="Pulihkan sesi" type="file" accept=".json" disabled={busy} onChange={fileHandler(async f => { const data = JSON.parse(await f.text()); if (data.version !== 1 || !Array.isArray(data.talents) || !data.project) throw new Error('Format sesi tidak sesuai.'); await rank(data); setProject(data.project); setTalents(data.talents); setAssignments(data.assignments ?? []); setWarnings(data.warnings ?? []); setRanking(null); })} /></label>
        </Card>
      </div>
      {[...warnings, ...(project?.warnings ?? [])].length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><ul className="list-disc space-y-1 pl-5">{[...warnings, ...(project?.warnings ?? [])].map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
      <Card title="Kapasitas & beban kerja" description="Current FTE harus mencakup periode proyek yang sama. Semua alokasi dalam rencana ini dihitung bersamaan; total kapasitas default 1 FTE dapat diubah.">
        <div className="mb-4 flex flex-wrap gap-3"><input className={`${inputClass} max-w-sm`} placeholder="Cari nama atau role" aria-label="Cari talent" value={query} onChange={e => setQuery(e.target.value)} /><span className="self-center text-sm text-muted">{talents.filter(t => t.current_fte == null).length} Current FTE belum diisi</span></div>
        <div className="max-h-[28rem] overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-canvas"><tr>{['Nama', 'Role Utama', 'Preferred Role', 'Tribe / Project', 'Current FTE', 'Capacity FTE'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{talents.filter(searched).map(t => <tr key={t.id} className="border-t border-line"><td className="p-3 font-medium">{t.name}</td><td className="p-3">{t.primary_role}</td><td className="p-3">{t.preferred_roles}</td><td className="p-3">{t.project}</td>{(['current_fte', 'capacity_fte'] as const).map(field => <td key={field} className="p-3"><input className={`${inputClass} w-28`} aria-label={`${field} ${t.name}`} type="number" min={field === 'capacity_fte' ? 0.01 : 0} max={10} step="0.05" value={t[field] ?? ''} placeholder="Unknown" onChange={e => { const v = e.target.value === '' ? null : Number(e.target.value); setTalents(talents.map(x => x.id === t.id ? { ...x, [field]: field === 'capacity_fte' ? Math.max(0.01, v ?? 1) : v } : x)); }} /></td>)}</tr>)}</tbody></table></div>
      </Card>
      <div className="flex items-center justify-between"><p className="text-xs text-muted">Data sesi berada di memori browser. Simpan sesi sebelum menutup atau berpindah halaman. File talent tidak disertakan dalam repositori publik.</p><Button disabled={!project || !talents.length} onClick={() => { setStep(1); setQuery(''); }}>Tinjau kebutuhan skill <ArrowRight size={16} /></Button></div>
    </div>}
    {step === 1 && project && <div className="space-y-5">
      <Card title="Kebutuhan proyek per role" description="Koreksi kebutuhan FTE dan target sebelum menghitung rekomendasi."><div className="grid gap-4 md:grid-cols-4">{project.demands.map((d, i) => <label key={d.role} className="text-sm font-medium">{roleNames[d.role] ?? d.role}<input aria-label={`Required FTE ${d.role}`} type="number" min={0} max={1000} step="0.05" className={`${inputClass} mt-2`} value={d.fte ?? ''} placeholder="FTE belum diisi" onChange={e => setProject({ ...project, demands: project.demands.map((x, j) => j === i ? { ...x, fte: e.target.value === '' ? null : Number(e.target.value) } : x) })} /></label>)}</div></Card>
      <Card title="Capability & klasifikasi UCP" description="Bobot awal mengikuti bobot efektif UCP dari WBS: Simple 5, Average 10, Complex 15, dikali Qty dan faktor peran. Skill yang muncul di beberapa WBS mengakumulasi bobot. Target awal 3 (menengah).">
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_2fr_3fr_auto]">
          <select aria-label="Role untuk skill baru" className={inputClass} value={newRole} onChange={e => { setNewRole(e.target.value); setAddSkill(''); }}>{Object.keys(catalog?.roles ?? roleNames).map(r => <option key={r} value={r}>{roleNames[r] ?? r}</option>)}</select>
          <input aria-label="WBS ID baru" className={inputClass} placeholder="WBS ID" value={newItem} onChange={e => setNewItem(e.target.value)} />
          <select aria-label="Tambah skill katalog" className={inputClass} value={addSkill} onChange={e => setAddSkill(e.target.value)}><option value="">Pilih skill dari katalog</option>{choices.map((c, i) => c.role === newRole && <option key={i} value={String(i)}>{c.pillar} • {c.skill}</option>)}</select>
          <Button variant="secondary" disabled={addSkill === '' || !newItem.trim()} onClick={() => { const c = choices[Number(addSkill)]; if (project.requirements.some(r => r.item_id === newItem.trim() && r.role === c.role && r.skill === c.skill && r.pillar === c.pillar)) { setError('Skill tersebut sudah ada untuk WBS dan role ini.'); return; } setProject({ ...project, requirements: [...project.requirements, { ...c, item_id: newItem.trim(), item_name: '', classification: 'Average', weight: 10, target: 3, reason: 'Ditambahkan reviewer' }], demands: project.demands.some(d => d.role === c.role) ? project.demands : [...project.demands, { role: c.role, fte: null }] }); }}><Plus size={16} /> Tambah</Button>
        </div>
        <div className="max-h-[34rem] overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-canvas"><tr>{['WBS', 'Role', 'Skill', 'Klasifikasi', 'Bobot', 'Target', ''].map((h, i) => <th key={i} className="p-3">{h}</th>)}</tr></thead><tbody>{project.requirements.map((r, i) => <tr key={`${i}-${r.item_id}`} className="border-t border-line"><td className="p-3" title={r.item_name}>{r.item_id}</td><td className="p-3">{r.role}</td><td className="p-3"><p className="font-medium">{r.skill}</p><p className="text-xs text-muted">{r.pillar}</p><p className="mt-1 text-xs text-muted">{r.reason}</p></td><td className="p-3"><select aria-label={`Classification ${i}`} className={inputClass} value={r.classification} onChange={e => { const c = e.target.value as Requirement['classification']; const weights = { Simple: 5, Average: 10, Complex: 15 }; updateRequirement(i, { classification: c, weight: r.weight * weights[c] / weights[r.classification] }); }}>{['Simple', 'Average', 'Complex'].map(c => <option key={c}>{c}</option>)}</select></td><td className="p-3"><input aria-label={`Weight ${i}`} type="number" min={0.01} step="0.25" className={`${inputClass} w-24`} value={r.weight} onChange={e => updateRequirement(i, { weight: Math.max(0.01, Number(e.target.value)) })} /></td><td className="p-3"><select aria-label={`Target ${i}`} className={inputClass} value={r.target} onChange={e => updateRequirement(i, { target: Number(e.target.value) })}>{[2, 3, 4, 5].map(n => <option key={n} value={n}>{n} • {scale[n - 1]}</option>)}</select></td><td className="p-3"><Button aria-label={`Remove requirement ${i}`} variant="ghost" onClick={() => setProject({ ...project, requirements: project.requirements.filter((_, j) => j !== i) })}><Trash2 size={16} /></Button></td></tr>)}</tbody></table></div>
      </Card>
      <div className="flex justify-end"><Button onClick={() => { setStep(2); setQuery(''); }} disabled={!project.requirements.length}>Hitung rekomendasi <ArrowRight size={16} /></Button></div>
    </div>}
    {step === 2 && <div className="space-y-5">
      <Card title="Skor yang dapat ditelusuri" description="70 poin proficiency + 20 poin cakupan target + 10 poin kapasitas. Role Utama dan Preferred Role tidak memberikan poin dan tidak membatasi kandidat."><p className="text-sm text-muted">Proficiency = rata-rata berbobot (level − 1) / 4. Cakupan = proporsi bobot skill yang mencapai target. Kapasitas = available FTE / sisa kebutuhan per orang (maksimum 1). Nilai 1 berarti tidak ada pengalaman (0 poin skill). FTE tidak diketahui mendapat 0 poin kapasitas dan label provisional. Bobot adalah kebijakan awal yang perlu dikalibrasi melalui hasil penugasan.</p></Card>
      <div className="flex flex-wrap items-center justify-between gap-3"><select aria-label="Role rekomendasi" className={`${inputClass} max-w-sm`} value={role || report?.role || ''} onChange={e => { setRole(e.target.value); setInspect(null); }}>{project?.demands.map(d => <option key={d.role} value={d.role}>{roleNames[d.role] ?? d.role}</option>)}</select><Button disabled={!fresh || busy} onClick={() => perform(async () => { if (body) await exportPlan(body); })}><Download size={16} /> Unduh rencana Excel</Button></div>
      {!fresh && <p role="status" className="flex items-center gap-2 text-sm text-muted"><Loader2 className="animate-spin" size={16} /> Menghitung ulang skor dan kapasitas…</p>}
      {report && <>
        <div className="grid gap-3 md:grid-cols-3">{[['Dibutuhkan', report.required_fte], ['Dialokasikan', report.assigned_fte], ['Sisa kebutuhan', report.remaining_fte]].map(([label, v]) => <div key={String(label)} className="rounded-xl border border-line bg-white p-5"><p className="text-sm text-muted">{label}</p><p className="mt-1 text-2xl font-semibold">{fmt(v as number | null)} <span className="text-sm font-normal">FTE</span></p></div>)}</div>
        <Card title={`Kandidat ${roleNames[report.role] ?? report.role}`} description={`${talents.length} talent dari seluruh role, diurutkan dari skor tertinggi. Klik rincian untuk melihat nilai tiap skill.`}>
          <input aria-label="Cari kandidat" placeholder="Cari nama atau role" className={`${inputClass} mb-4 max-w-sm`} value={query} onChange={e => setQuery(e.target.value)} />
          <div className="max-h-[36rem] overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-canvas"><tr>{['Talent', 'Skor / 100', 'Skill / 70', 'Coverage / 20', 'Capacity / 10', 'Available FTE', ''].map((h, i) => <th key={i} className="p-3">{h}</th>)}</tr></thead><tbody>{report.candidates.filter(searched).map(c => <tr key={c.talent_id} className="border-t border-line"><td className="p-3"><p className="font-semibold">{c.name}</p><p className="text-xs text-muted">{c.primary_role} • {c.project}</p>{c.provisional && <StatusBadge tone="warn">Provisional</StatusBadge>}</td><td className="p-3 font-semibold text-accent-700">{c.score == null ? 'Tanpa skill' : c.score.toFixed(1)}</td><td className="p-3">{c.skill_score.toFixed(1)}</td><td className="p-3">{c.coverage_score.toFixed(1)}</td><td className="p-3">{c.capacity_score.toFixed(1)}</td><td className="p-3">{fmt(c.available_fte)}</td><td className="p-3"><div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => setInspect(c.talent_id)}>Rincian</Button><Button size="sm" variant="secondary" disabled={!fresh || assignments.some(a => a.role === report.role && a.talent_id === c.talent_id)} onClick={() => select(c)}>Pilih</Button></div></td></tr>)}</tbody></table></div>
        </Card>
        {selectedDetail && <Card title={`Rincian skill • ${selectedDetail.name}`} actions={<Button variant="ghost" onClick={() => setInspect(null)}>Tutup</Button>}><div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['Skill', 'Level', 'Target', 'Bobot', 'Hasil'].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{selectedDetail.details.map(d => <tr key={`${d.pillar}-${d.skill}`} className="border-t border-line"><td className="p-2">{d.skill}<p className="text-xs text-muted">{d.pillar}</p></td><td className="p-2">{d.level == null ? 'Tidak tersedia' : `${d.level} • ${scale[d.level - 1]}`}</td><td className="p-2">{d.target}</td><td className="p-2">{d.weight.toFixed(2)}</td><td className="p-2"><StatusBadge tone={d.meets_target ? 'good' : 'warn'}>{d.meets_target ? 'Memenuhi' : 'Gap'}</StatusBadge></td></tr>)}</tbody></table></div></Card>}
      </>}
      <Card title="Pilihan reviewer" description="Pilih, ubah alokasi FTE, atau ganti talent tanpa mengikuti urutan rekomendasi. Satu talent dapat mengisi beberapa role; kapasitasnya dihitung secara total.">
        {!assignments.length ? <p className="text-sm text-muted">Belum ada penugasan. Gunakan tombol Pilih pada kandidat.</p> : <div className="space-y-3">{assignments.map((a, i) => <div key={`${a.role}-${a.talent_id}`} className="grid items-center gap-3 rounded-lg border border-line p-3 md:grid-cols-[1fr_2fr_1fr_3fr_auto]"><p className="text-sm font-medium">{roleNames[a.role] ?? a.role}</p><select aria-label={`Talent assignment ${i}`} className={inputClass} value={a.talent_id} onChange={e => setAssignments(assignments.map((x, j) => i === j ? { ...x, talent_id: e.target.value } : x))}>{talents.map(t => <option key={t.id} value={t.id} disabled={assignments.some((other, j) => j !== i && other.role === a.role && other.talent_id === t.id)}>{t.name}</option>)}</select><input aria-label={`Assignment FTE ${i}`} className={inputClass} type="number" min={0.01} max={10} step="0.05" value={a.fte} onChange={e => setAssignments(assignments.map((x, j) => i === j ? { ...x, fte: Math.max(0.01, Number(e.target.value)) } : x))} /><input aria-label={`Assignment reason ${i}`} className={inputClass} placeholder="Alasan pemilihan reviewer" value={a.reason} onChange={e => setAssignments(assignments.map((x, j) => i === j ? { ...x, reason: e.target.value } : x))} /><Button aria-label={`Remove assignment ${i}`} variant="ghost" onClick={() => setAssignments(assignments.filter((_, j) => j !== i))}><Trash2 size={16} /></Button></div>)}</div>}
        {fresh && !!ranking?.alerts.length && <ul className="mt-4 list-disc space-y-1 rounded-lg bg-amber-50 p-4 pl-8 text-sm text-amber-950">{ranking.alerts.map((a, i) => <li key={i}>{a}</li>)}</ul>}
        <p className="mt-4 text-xs text-muted">Ekspor adalah usulan yang dipilih manusia, bukan persetujuan otomatis. Konfirmasi beban kerja dan ketersediaan dengan talent sebelum penugasan final. Simpan sesi untuk melanjutkan setelah browser ditutup.</p>
      </Card>
    </div>}
  </>;
}
