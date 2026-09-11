import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { getDocs, getWorkflow, createWorkflow, updateWorkflow } from '../api'
import type { Grade, WorkflowType } from '../types'

export default function WorkflowNew() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const fromId = params.get('from') ? parseInt(params.get('from')!) : null

  const { data: template } = useQuery({
    queryKey: ['workflow', fromId],
    queryFn: () => getWorkflow(fromId!),
    enabled: !!fromId,
  })
  const { data: docs = [] } = useQuery({ queryKey: ['docs'], queryFn: getDocs })

  const [name, setName] = useState('')
  const [type, setType] = useState<WorkflowType>(template?.type ?? 'worksheet')
  const [grade, setGrade] = useState<Grade>(template?.grade ?? 'english1')
  const [context, setContext] = useState(template?.context ?? '')
  const [instructions, setInstructions] = useState(template?.instructions ?? '')
  const [selectedDocs, setSelectedDocs] = useState<number[]>(
    template ? JSON.parse(template.doc_ids ?? '[]') : []
  )
  const [error, setError] = useState('')

  const create = useMutation({
    mutationFn: async () => {
      const wf = await createWorkflow({ name, type, grade, context: context || null, instructions: instructions || null, doc_ids: JSON.stringify(selectedDocs) })
      if (template?.rubric) await updateWorkflow(wf.id, { rubric: template.rubric })
      return wf
    },
    onSuccess: (wf) => navigate(`/workflows/${wf.id}`),
    onError: (e: Error) => setError(e.message),
  })

  const toggleDoc = (id: number) => setSelectedDocs(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id])

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link to={fromId ? `/workflows/${fromId}` : '/workflows'} className="text-slate-500 text-sm hover:text-slate-300">
          ← {template ? template.name : 'Workflows'}
        </Link>
        <h1 className="text-2xl font-bold mt-1">{template ? 'New Workflow from Template' : 'New Workflow'}</h1>
      </div>

      {template && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-sm text-blue-300 mb-6">
          Pre-filled from <strong>{template.name}</strong> — rubric carried over. Update the name and context for today's lesson.
        </div>
      )}

      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-300 mb-4">{error}</div>}

      <div className="card space-y-5">
        <div>
          <label className="label">Workflow Name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Textual Evidence — The Lottery, Week 4" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Output Type</label>
            <select className="input" value={type} onChange={e => setType(e.target.value as WorkflowType)}>
              <option value="worksheet">Worksheet</option>
              <option value="foldable">Foldable</option>
              <option value="slideshow">Slideshow</option>
              <option value="study_guide">Study Guide</option>
              <option value="lesson_plan">Lesson Plan</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div>
            <label className="label">Class</label>
            <select className="input" value={grade} onChange={e => setGrade(e.target.value as Grade)}>
              <option value="english1">English 1 (9th)</option>
              <option value="english2">English 2 (10th)</option>
              <option value="both">Both</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">Curriculum Docs to Reference</label>
          <div className="border border-slate-700 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
            {docs.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">No docs yet. <Link to="/documents" className="text-blue-400">Add some first.</Link></p>
            ) : docs.map(d => (
              <label key={d.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-slate-800 cursor-pointer border-b border-slate-800 last:border-0">
                <input type="checkbox" checked={selectedDocs.includes(d.id)} onChange={() => toggleDoc(d.id)} className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-slate-200">{d.title ?? d.filename}</p>
                  <p className="text-xs text-slate-500">{d.filename}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="label">What do you want to create?</label>
          <textarea className="input" rows={4} value={context} onChange={e => setContext(e.target.value)} placeholder="Topic, unit, learning objectives…" />
        </div>

        <div>
          <label className="label">Special Instructions <span className="text-slate-500 font-normal">(optional)</span></label>
          <textarea className="input" rows={2} value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Keep to one page, include word bank, etc." />
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={() => create.mutate()} disabled={!name || create.isPending} className="btn btn-lg">
            {create.isPending ? 'Creating…' : 'Create Workflow'}
          </button>
          <Link to={fromId ? `/workflows/${fromId}` : '/workflows'} className="btn btn-lg btn-ghost">Cancel</Link>
        </div>
      </div>
    </div>
  )
}
