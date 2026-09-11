import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { getSuggestions, createSuggestion, updateSuggestion, deleteSuggestion } from '../api'
import { formatDate } from '../utils'

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/15 text-blue-400',
  reviewed: 'bg-yellow-500/15 text-yellow-400',
  planned: 'bg-purple-500/15 text-purple-400',
  done: 'bg-green-500/15 text-green-400',
}

export default function Suggestions() {
  const qc = useQueryClient()
  const { data: suggestions = [] } = useQuery({ queryKey: ['suggestions'], queryFn: getSuggestions })
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const create = useMutation({
    mutationFn: () => createSuggestion({ title, description }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suggestions'] }); setTitle(''); setDescription('') },
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updateSuggestion(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suggestions'] }),
  })

  const del = useMutation({
    mutationFn: (id: number) => deleteSuggestion(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suggestions'] }),
  })

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">Suggestions</h1>
      <p className="text-slate-400 text-sm mb-6">Submit feature requests. Grant reviews and tracks them here.</p>

      <div className="card mb-8 max-w-xl">
        <h2 className="font-semibold mb-4">Submit a Suggestion</h2>
        <div className="space-y-4">
          <div>
            <label className="label">Title</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Short description of what you'd like" />
          </div>
          <div>
            <label className="label">Details</label>
            <textarea className="input" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe what you'd like the tool to do…" />
          </div>
          <button onClick={() => create.mutate()} disabled={!title || !description} className="btn">Submit</button>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="card p-0 overflow-hidden">
          {suggestions.map(s => (
            <div key={s.id} className="flex items-start gap-4 px-5 py-4 border-b border-slate-800 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-slate-200">{s.title}</p>
                <p className="text-sm text-slate-400 mt-0.5">{s.description}</p>
                <p className="text-xs text-slate-600 mt-1">{formatDate(s.created_at)}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`badge ${STATUS_COLORS[s.status]}`}>{s.status}</span>
                <select
                  value={s.status}
                  onChange={e => updateStatus.mutate({ id: s.id, status: e.target.value })}
                  className="bg-slate-800 border border-slate-700 text-xs rounded-lg px-2 py-1 text-slate-300"
                >
                  {['new', 'reviewed', 'planned', 'done'].map(st => <option key={st}>{st}</option>)}
                </select>
                <button onClick={() => { if (confirm('Delete?')) del.mutate(s.id) }} className="btn btn-sm btn-ghost p-1 text-red-400"><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
