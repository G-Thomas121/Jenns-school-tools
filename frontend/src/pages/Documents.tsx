import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Trash2, Edit2, Check, X } from 'lucide-react'
import { getDocs, scanDocs, updateDoc, deleteDoc, uploadDoc } from '../api'
import { formatDate } from '../utils'
import type { CurriculumDoc } from '../types'

export default function Documents() {
  const qc = useQueryClient()
  const { data: docs = [] } = useQuery({ queryKey: ['docs'], queryFn: getDocs })
  const [editing, setEditing] = useState<number | null>(null)
  const [editData, setEditData] = useState<Partial<CurriculumDoc>>({})
  const [scanMsg, setScanMsg] = useState('')

  const scan = useMutation({
    mutationFn: scanDocs,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['docs'] })
      setScanMsg(res.added.length ? `Added: ${res.added.join(', ')}` : 'No new files found.')
    },
  })

  const upload = useMutation({
    mutationFn: (file: File) => uploadDoc(file),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['docs'] }); setScanMsg(data.message) },
  })

  const save = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CurriculumDoc> }) => updateDoc(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['docs'] }); setEditing(null) },
  })

  const del = useMutation({
    mutationFn: (id: number) => deleteDoc(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['docs'] }),
  })

  const startEdit = (doc: CurriculumDoc) => {
    setEditing(doc.id)
    setEditData({ title: doc.title ?? '', subject: doc.subject ?? '', grade: doc.grade ?? '', description: doc.description ?? '' })
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Curriculum Docs</h1>
          <p className="text-slate-400 text-sm mt-0.5">Drop files in <code className="text-blue-400">curriculum/</code> then scan, or upload directly.</p>
        </div>
        <div className="flex gap-2 items-center">
          <label className="btn btn-outline cursor-pointer">
            ↑ Upload
            <input type="file" accept=".pdf,.docx,.txt,.md" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) { upload.mutate(f); e.target.value = '' } }} />
          </label>
          <button onClick={() => scan.mutate()} disabled={scan.isPending} className="btn">
            <RefreshCw size={14} className={scan.isPending ? 'animate-spin' : ''} />
            {scan.isPending ? 'Scanning…' : 'Scan Folder'}
          </button>
        </div>
      </div>

      {scanMsg && <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-sm text-green-300 mb-4">{scanMsg}</div>}

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-sm text-blue-300 mb-6">
        Supported: PDF, DOCX, TXT, MD — drop into the <code>curriculum/</code> folder at the project root, then click Scan. Or upload directly using the button above.
      </div>

      {docs.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">No documents yet. Upload or scan the curriculum folder.</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          {docs.map(doc => (
            <div key={doc.id} className="border-b border-slate-800 last:border-0">
              {editing === doc.id ? (
                <div className="px-5 py-4 space-y-3 bg-slate-800/30">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="label text-xs">Title</label>
                      <input className="input text-sm" value={editData.title ?? ''} onChange={e => setEditData(p => ({ ...p, title: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label text-xs">Subject</label>
                      <input className="input text-sm" value={editData.subject ?? ''} onChange={e => setEditData(p => ({ ...p, subject: e.target.value }))} placeholder="Literature" />
                    </div>
                    <div>
                      <label className="label text-xs">Grade</label>
                      <select className="input text-sm" value={editData.grade ?? ''} onChange={e => setEditData(p => ({ ...p, grade: e.target.value }))}>
                        <option value="">—</option>
                        <option value="english1">English 1 (9th)</option>
                        <option value="english2">English 2 (10th)</option>
                        <option value="both">Both</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="label text-xs">Description</label>
                    <input className="input text-sm" value={editData.description ?? ''} onChange={e => setEditData(p => ({ ...p, description: e.target.value }))} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => save.mutate({ id: doc.id, data: editData })} className="btn btn-sm"><Check size={12} /> Save</button>
                    <button onClick={() => setEditing(null)} className="btn btn-sm btn-ghost"><X size={12} /> Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-800/20">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200">{doc.title ?? doc.filename}</p>
                    <p className="text-xs text-slate-500">{doc.filename} {doc.subject ? `· ${doc.subject}` : ''} · Added {formatDate(doc.added_at)}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => startEdit(doc)} className="btn btn-sm btn-ghost p-1.5"><Edit2 size={13} /></button>
                    <button onClick={() => { if (confirm(`Remove ${doc.filename}?`)) del.mutate(doc.id) }} className="btn btn-sm btn-ghost p-1.5 text-red-400"><Trash2 size={13} /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
