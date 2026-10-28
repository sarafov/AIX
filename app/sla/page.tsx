"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Plus, Trash2 } from 'lucide-react';
import { Button, Card, PageHeader, inputClass } from '@/components/ui';
import { useStore } from '@/lib/store';
import { download } from '@/lib/staffing';
import { slaRequest } from '@/lib/sla';
import type { SlaDraft, SlaRow, SlaSeed } from '@/lib/sla';

const textFields = [
  ['background', 'Latar belakang proyek'], ['objectives', 'Objektif strategis'],
  ['engagement', 'Model keterlibatan'], ['assignment_terms', 'Ketentuan penugasan'],
] as const;
const clauses = [
  ['intake', '3. Work Intake & Sprint Planning Rules'],
  ['communication', '4. Communication SLA & Async Operating Rhythm'],
  ['definition_of_done', '5. Definition of Done & Sign-Off Criteria'],
  ['escalation', '6. Escalation Protocol'],
] as const;

export default function SlaPage() {
  const { planningSession, slaDraft, setSlaDraft, files, run, project, catalog } = useStore();
  const [seed, setSeed] = useState<SlaSeed | null>(null);
  const [usePlan, setUsePlan] = useState(Boolean(planningSession?.assignments.length));
  const [extraDocs, setExtraDocs] = useState<File[]>([]);
  const [reuseDocs, setReuseDocs] = useState(true);
  const [manualContext, setManualContext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const priorDocs = [...files.request, ...files.supporting];
  const docs = [...(reuseDocs ? priorDocs : []), ...extraDocs].filter((f, i, all) => all.findIndex(g => g.name === f.name && g.size === f.size && g.lastModified === f.lastModified) === i);
  const info = run?.project ?? project;
  const draft = slaDraft;
  const total = draft?.rows.reduce((s, r) => s + r.fte, 0) ?? 0;
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (draft) e.preventDefault(); };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [draft]);
  async function perform(action: () => Promise<void>) { setBusy(true); setError(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }
  function update(patch: Partial<SlaDraft>) { if (draft) setSlaDraft({ ...draft, ...patch }); }
  function rowChange(i: number, patch: Partial<SlaRow>) { if (draft) update({ rows: draft.rows.map((r, j) => j === i ? { ...r, ...patch } : r) }); }
  async function generate() {
    const settings = { seed: usePlan ? null : seed, staffing: usePlan ? planningSession : null, project_info: { ...info, context: manualContext || info.context }, catalog };
    const body = new FormData(); const encoded = JSON.stringify(settings); body.append('settings', encoded);
    if (docs.length > 5 || docs.reduce((s, f) => s + f.size, new Blob([encoded]).size) > 4 * 1024 * 1024) throw new Error('Maksimum 5 dokumen dan total 4 MB termasuk data penugasan.');
    docs.forEach(f => body.append('documents', f));
    setSlaDraft(await slaRequest<SlaDraft>('draft', { method: 'POST', body }));
  }
  async function exportFile(kind: 'pdf' | 'docx') {
    const response = await fetch(`/api/py/sla/export/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(typeof body.detail === 'string' ? body.detail : 'Ekspor gagal. Periksa isi draf.'); }
    download(await response.blob(), `Deliverable_Based_Resource_SLA.${kind}`);
  }
  return <>
    <PageHeader title="Draf Deliverable-Based Resource SLA" description="Lanjutkan pilihan talent menjadi draf komitmen deliverable. Semua teks dan tabel dapat diedit sebelum diunduh." actions={<Link href="/penugasan" className="text-sm text-accent-700"><ArrowLeft size={14} className="inline" /> Kembali ke penugasan</Link>} />
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {busy && <p role="status" className="mb-4 text-sm text-muted">Memproses dokumen…</p>}
    <div className="space-y-5">
      <Card title="Sumber penugasan dan informasi proyek" description="Gunakan rencana yang sedang ditinjau atau unggah hasil Talent Assignment Plan. Unggah KAK/project charter jika dokumen Validasi Baru belum memuat informasi proyek.">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            {planningSession?.assignments.length ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={usePlan} onChange={e => setUsePlan(e.target.checked)} /> Gunakan {planningSession.assignments.length} pilihan talent dari penugasan saat ini</label> : <p className="text-sm text-muted">Belum ada pilihan talent aktif. <Link href="/penugasan" className="underline">Pilih talent</Link> atau unggah plan di bawah.</p>}
            <label className="block text-sm">Talent Assignment Plan (.xlsx)<input aria-label="Unggah Talent Assignment Plan" className={`${inputClass} mt-2`} type="file" accept=".xlsx" disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; void perform(async () => { if (f.size > 4 * 1024 * 1024) throw new Error('Maksimum 4 MB.'); const body = new FormData(); body.append('file', f); const data = await slaRequest<SlaSeed>('plan', { method: 'POST', body }); setSeed(data); setUsePlan(false); }); }} /></label>
            {seed && <p role="status" className="text-sm text-emerald-800">{seed.rows.length} penugasan dari workbook berhasil dimuat.</p>}
            <label className="block text-sm">KAK / Project Charter / dokumen tambahan<input aria-label="Dokumen informasi proyek SLA" className={`${inputClass} mt-2`} type="file" multiple accept=".pdf,.docx,.txt,.md" disabled={busy} onChange={e => { const added = [...(e.target.files ?? [])]; e.target.value = ''; setExtraDocs([...extraDocs, ...added]); }} /></label>
            {priorDocs.length > 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reuseDocs} onChange={e => setReuseDocs(e.target.checked)} /> Gunakan kembali {priorDocs.length} dokumen dari Validasi Baru</label>}
            <ul className="space-y-1 text-xs text-muted">{docs.map((f, i) => <li key={`${f.name}-${i}`}>{f.name}{extraDocs.includes(f) && <button type="button" className="ml-2 underline" aria-label={`Hapus dokumen ${f.name}`} onClick={() => setExtraDocs(extraDocs.filter(x => x !== f))}>Hapus</button>}</li>)}</ul>
          </div>
          <div className="space-y-3">
            <p className="text-sm text-muted">Nama dan periode proyek dari hasil estimasi digunakan bila tersedia. Informasi yang tidak ditemukan ditandai “Diisi reviewer”. PDF scan harus memiliki teks OCR. Dokumen diproses tanpa dikirim ke model AI.</p>
            <label className="block text-sm">Konteks proyek tambahan<textarea aria-label="Konteks proyek SLA" rows={6} className={`${inputClass} mt-2`} value={manualContext} onChange={e => setManualContext(e.target.value)} placeholder="Isi latar belakang dan tujuan dari KAK/charter jika belum ada pada input sebelumnya." /></label>
            <p className="text-xs text-muted">Bagian 3-6 mengikuti contoh SLA. Lingkup per role berasal dari katalog aktif, dilengkapi kebutuhan proyek dari plan. Angka KPI spesifik perlu ditinjau dan ditambahkan sesuai dokumen proyek.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3"><Button disabled={busy || !(usePlan ? planningSession?.assignments.length : seed?.rows.length)} onClick={() => perform(generate)}>{draft ? 'Bangun ulang draf dari sumber' : 'Buat draf SLA'}</Button>{draft && <p className="self-center text-xs text-muted">Bangun ulang mengganti teks dan tabel yang sudah diedit.</p>}</div>
      </Card>
      <Card title="Simpan atau pulihkan draf" description="Draf tersimpan di memori selama navigasi dalam aplikasi. Simpan file sesi sebelum menutup tab.">
        <div className="flex flex-wrap items-center gap-3"><Button variant="secondary" disabled={!draft || busy} onClick={() => download(new Blob([JSON.stringify({ version: 1, draft }, null, 2)], { type: 'application/json' }), 'Resource_SLA_Draft.json')}>Simpan draf</Button><label className="text-sm">Pulihkan draf<input aria-label="Pulihkan draf SLA" className={`${inputClass} mt-1`} type="file" accept=".json" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; void perform(async () => { if (f.size > 4 * 1024 * 1024) throw new Error('Maksimum 4 MB.'); const data = JSON.parse(await f.text()); if (data.version !== 1 || !data.draft || !Array.isArray(data.draft.rows)) throw new Error('Format draf tidak sesuai.'); await slaRequest('validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data.draft) }).then(validated => setSlaDraft(validated as SlaDraft)); }); }} /></label></div>
      </Card>
      {draft && <>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-4"><p className="text-sm"><strong>Draf untuk ditinjau</strong> · {draft.rows.length} talent/role · Total {total.toFixed(2)} FTE</p><div className="flex gap-2"><Button disabled={busy} variant="secondary" onClick={() => perform(() => exportFile('docx'))}><Download size={15} /> Unduh Word</Button><Button disabled={busy} onClick={() => perform(() => exportFile('pdf'))}><Download size={15} /> Unduh PDF</Button></div></div>
        <Card title="Project Information"><div className="grid gap-4 md:grid-cols-2">{([['title', 'Judul dokumen'], ['project_name', 'Project Name'], ['chapter', 'Talent Source / Chapter'], ['period', 'Cycle / Period'], ['owner_pm', 'Project Owner / PM']] as const).map(([key, label]) => <label key={key} className="text-sm">{label}<input aria-label={label} className={`${inputClass} mt-1`} value={draft[key]} onChange={e => update({ [key]: e.target.value })} /></label>)}</div></Card>
        <Card title="1. Project Context & Engagement Model"><div className="space-y-4">{textFields.map(([key, label]) => <label key={key} className="block text-sm">{label}<textarea aria-label={label} rows={5} className={`${inputClass} mt-1`} value={draft[key]} onChange={e => update({ [key]: e.target.value })} /></label>)}</div></Card>
        <Card title="2. FTE & KPI Deliverable" description="FTE berasal dari pilihan reviewer. Ubah lingkup, tambahkan KPI/acceptance criteria, atau tambah/hapus baris sesuai kesepakatan proyek.">
          <label className="block text-sm">Catatan deliverable<textarea aria-label="Catatan deliverable" rows={4} className={`${inputClass} mt-1 mb-4`} value={draft.deliverable_notes} onChange={e => update({ deliverable_notes: e.target.value })} /></label>
          <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm" aria-label="Tabel FTE dan deliverable SLA"><thead><tr>{['No', 'Role / Skillstream', 'Nama Talent', 'FTE', 'In-Scope Deliverables', 'Out-of-Scope', ''].map((h, i) => <th key={i} className="p-2">{h}</th>)}</tr></thead><tbody>{draft.rows.map((r, i) => <tr key={i} className="border-t border-line"><td className="p-2">{i + 1}</td><td className="p-2"><input aria-label={`SLA Role ${i}`} className={`${inputClass} w-36`} value={r.role} onChange={e => rowChange(i, { role: e.target.value })} /></td><td className="p-2"><input aria-label={`SLA Talent ${i}`} className={`${inputClass} w-40`} value={r.talent} onChange={e => rowChange(i, { talent: e.target.value })} /></td><td className="p-2"><input aria-label={`SLA FTE ${i}`} type="number" min={0} max={10} step="0.05" className={`${inputClass} w-24`} value={r.fte} onChange={e => rowChange(i, { fte: Math.min(10, Math.max(0, Number(e.target.value))) })} /></td>{(['in_scope', 'out_scope'] as const).map(key => <td key={key} className="p-2"><textarea aria-label={`SLA ${key} ${i}`} rows={7} className={`${inputClass} min-w-64`} value={r[key]} onChange={e => rowChange(i, { [key]: e.target.value })} /></td>)}<td className="p-2"><Button variant="ghost" aria-label={`Hapus baris SLA ${i}`} onClick={() => update({ rows: draft.rows.filter((_, j) => i !== j) })}><Trash2 size={16} /></Button></td></tr>)}</tbody></table></div>
          <Button variant="secondary" className="mt-4" onClick={() => update({ rows: [...draft.rows, { role: '', talent: '', fte: 0, in_scope: '', out_scope: '' }] })}><Plus size={15} /> Tambah baris</Button>
        </Card>
        {clauses.map(([key, title]) => <Card key={key} title={title}><textarea aria-label={title} rows={12} className={inputClass} value={draft[key]} onChange={e => update({ [key]: e.target.value })} /></Card>)}
        <Card title="Sumber dan catatan review"><p className="mb-3 text-sm text-muted">{draft.sources.join(' · ') || 'Konteks proyek manual'}</p><label className="block text-sm">Catatan review<textarea aria-label="Catatan review SLA" className={`${inputClass} mt-1`} rows={5} value={draft.warnings.join('\n')} onChange={e => update({ warnings: e.target.value.split('\n').filter(Boolean) })} /></label></Card>
      </>}
    </div>
  </>;
}
