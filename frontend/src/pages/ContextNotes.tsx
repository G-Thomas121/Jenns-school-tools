import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ToggleLeft, ToggleRight, Edit2 } from 'lucide-react'
import { getContextNotes, createContextNote, updateContextNote, deleteContextNote } from '../api'
import type { ContextNote } from '../types'

const CATEGORIES = ['general', 'class', 'students', 'preference']
const CAT_COLORS: Record<string, string> = {
  general: 'bg-slate-500/15 text-slate-400',
  class: 'bg-blue-500/15 text-blue-400',
  students: 'bg-purple-500/15 text-purple-400',
  preference: 'bg-green-500/15 text-green-400',
}

export default function ContextNotes() {
  const qc = useQueryClient()
  const { data: notes = [] } = useQuery({ queryKey: ['context'], queryFn: getContextNotes })
  const [editing, setEditing] = useState<number | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', category: 'general' })

  const create = useMutation({
    mutationFn: () => createContextNote(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['context'] }); setForm({ title: '', content: '', category: 'general' }); setShowAdd(false) },
  })

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ContextNote> }) => updateContextNote(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['context'] }); setEditing(null) },
  })

  const del = useMutation({
    mutationFn: (id: number) => deleteContextNote(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['context'] }),
  })

  const active = notes.filter(n => n.active)
  const inactive = notes.filter(n => !n.active)

  const NoteCard = ({ note }: { note: ContextNote }) => (
    <div className={`card ${note.active ? '' : 'opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm text-slate-100">{note.title}</span>
            <span className={`badge ${CAT_COLORS[note.category] ?? 'bg-slate-500/15 text-slate-400'}`}>{note.category}</span>
          </div>
          <p className="text-sm text-slate-400 whitespace-pre-wrap">{note.content}</p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={() => update.mutate({ id: note.id, data: { active: !note.active } })} className="btn btn-sm btn-ghost p-1.5">
            {note.active ? <ToggleRight size={14} className="text-green-400" /> : <ToggleLeft size={14} />}
          </button>
          <button onClick={() => setEditing(editing === note.id ? null : note.id)} className="btn btn-sm btn-ghost p-1.5"><Edit2 size={13} /></button>
          <button onClick={() => { if (confirm('Delete?')) del.mutate(note.id) }} className="btn btn-sm btn-ghost p-1.5 text-red-400"><Trash2 size={13} /></button>
        </div>
      </div>
      {editing === note.id && <EditForm note={note} onSave={(data) => update.mutate({ id: note.id, data })} onCancel={() => setEditing(null)} />}
    </div>
  )

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">My Context</h1>
        <button onClick={() => setShowAdd(!showAdd)} className="btn"><Plus size={14} /> Add Note</button>
      </div>
      <p className="text-slate-400 text-sm mb-6">Active notes are automatically included in every generation prompt.</p>

      {showAdd && (
        <div className="card mb-6">
          <h2 className="font-semibold mb-4">New Note</h2>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <label className="label">Title</label>
              <input className="input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="English 1 Overview" />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="label">Content</label>
            <textarea className="input" rows={4} value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} placeholder="28 students, mixed reading levels, currently in short story unit…" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => create.mutate()} disabled={!form.title || !form.content} className="btn">Add Note</button>
            <button onClick={() => setShowAdd(false)} className="btn btn-ghost">Cancel</button>
          </div>
        </div>
      )}

      {active.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-3">Active — included in every generation</h2>
          <div className="space-y-3 mb-8">{active.map(n => <NoteCard key={n.id} note={n} />)}</div>
        </>
      )}

      {inactive.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-widest mb-3 mt-4">Inactive</h2>
          <div className="space-y-3">{inactive.map(n => <NoteCard key={n.id} note={n} />)}</div>
        </>
      )}

      {notes.length === 0 && !showAdd && (
        <div className="card text-center py-12 text-slate-500">No context notes yet. Add information about your classes, students, and teaching preferences.</div>
      )}
    </div>
  )
}

function EditForm({ note, onSave, onCancel }: { note: ContextNote; onSave: (data: Partial<ContextNote>) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [category, setCategory] = useState(note.category)
  return (
    <div className="mt-4 pt-4 border-t border-slate-700 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label text-xs">Title</label><input className="input text-sm" value={title} onChange={e => setTitle(e.target.value)} /></div>
        <div><label className="label text-xs">Category</label>
          <select className="input text-sm" value={category} onChange={e => setCategory(e.target.value)}>
            {['general','class','students','preference'].map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div><label className="label text-xs">Content</label><textarea className="input text-sm" rows={3} value={content} onChange={e => setContent(e.target.value)} /></div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ title, content, category })} className="btn btn-sm">Save</button>
        <button onClick={onCancel} className="btn btn-sm btn-ghost">Cancel</button>
      </div>
    </div>
  )
}
