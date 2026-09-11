import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, Trash2, FileText, Key, Monitor, Save } from 'lucide-react'
import {
  getWorkflow, getDocs, updateWorkflow, deleteWorkflow,
  deleteOutput, startGenerate, getJob,
} from '../api'
import OutputModal from '../components/OutputModal'
import { formatDate, typeBadge, gradeBadge } from '../utils'
import type { OutputVariant } from '../types'

interface ModalState { outputId: number; variant: OutputVariant; title: string }

export default function WorkflowDetail() {
  const { id } = useParams<{ id: string }>()
  const wfId = parseInt(id!)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: wf, isLoading } = useQuery({ queryKey: ['workflow', wfId], queryFn: () => getWorkflow(wfId) })
  const { data: docs = [] } = useQuery({ queryKey: ['docs'], queryFn: getDocs })

  const [modal, setModal] = useState<ModalState | null>(null)
  const [rubric, setRubric] = useState('')
  const [rubricSaved, setRubricSaved] = useState(false)
  const [editName, setEditName] = useState('')
  const [editContext, setEditContext] = useState('')
  const [editInstructions, setEditInstructions] = useState('')

  // Generate form state
  const [mode, setMode] = useState<'revise' | 'fresh'>('revise')
  const [baseOutputId, setBaseOutputId] = useState<number | null>(null)
  const [revisionInstructions, setRevisionInstructions] = useState('')
  const [selectedDocs, setSelectedDocs] = useState<number[]>([])
  const [variants, setVariants] = useState<string[]>(['student', 'teacher', 'slideshow'])
  const [versionLabel, setVersionLabel] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobProgress, setJobProgress] = useState('')
  const [genError, setGenError] = useState('')

  useEffect(() => {
    if (wf) {
      setRubric(wf.rubric ?? '')
      setEditName(wf.name)
      setEditContext(wf.context ?? '')
      setEditInstructions(wf.instructions ?? '')
      setSelectedDocs(JSON.parse(wf.doc_ids ?? '[]'))
      if (wf.outputs?.length) setBaseOutputId(wf.outputs[0].id)
    }
  }, [wf])

  // Poll job status
  useQuery({
    queryKey: ['job', jobId],
    queryFn: async () => {
      if (!jobId) return null
      const job = await getJob(jobId)
      setJobProgress(job.progress)
      if (job.status === 'complete') {
        setJobId(null)
        setJobProgress('')
        qc.invalidateQueries({ queryKey: ['workflow', wfId] })
        if (job.output_id) setModal({ outputId: job.output_id, variant: 'student', title: 'New Output' })
      } else if (job.status === 'error') {
        setJobId(null)
        setGenError(job.progress)
        setJobProgress('')
      }
      return job
    },
    enabled: !!jobId,
    refetchInterval: 3000,
  })

  const saveRubric = useMutation({
    mutationFn: () => updateWorkflow(wfId, { rubric: rubric || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workflow', wfId] }); setRubricSaved(true); setTimeout(() => setRubricSaved(false), 2000) },
  })

  const saveDetails = useMutation({
    mutationFn: () => updateWorkflow(wfId, { name: editName, context: editContext || null, instructions: editInstructions || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow', wfId] }),
  })

  const delWorkflow = useMutation({
    mutationFn: () => deleteWorkflow(wfId),
    onSuccess: () => navigate('/workflows'),
  })

  const delOutput = useMutation({
    mutationFn: (outId: number) => deleteOutput(wfId, outId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow', wfId] }),
  })

  const generate = useMutation({
    mutationFn: () => startGenerate({
      workflow_id: wfId,
      notes: versionLabel || null,
      base_output_id: mode === 'revise' ? baseOutputId : null,
      revision_instructions: mode === 'revise' ? revisionInstructions || null : null,
      variants,
    }),
    onSuccess: async (res) => {
      // Update doc selection first
      await updateWorkflow(wfId, { doc_ids: JSON.stringify(selectedDocs) })
      setJobId(res.job_id)
      setGenError('')
      setJobProgress('Queued…')
    },
    onError: (e: Error) => setGenError(e.message),
  })

  const toggleVariant = (v: string) => setVariants(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])
  const toggleDoc = (id: number) => setSelectedDocs(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id])

  if (isLoading) return <div className="p-8 text-slate-500">Loading…</div>
  if (!wf) return <div className="p-8 text-red-400">Workflow not found.</div>

  const hasOutputs = (wf.outputs?.length ?? 0) > 0

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <Link to="/workflows" className="text-slate-500 text-sm hover:text-slate-300">← Workflows</Link>
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{wf.name}</h1>
            <span dangerouslySetInnerHTML={{ __html: typeBadge(wf.type) }} />
            <span dangerouslySetInnerHTML={{ __html: gradeBadge(wf.grade) }} />
          </div>
          <div className="flex gap-2">
            <Link to={`/workflows/new?from=${wfId}`} className="btn btn-sm btn-outline"><Copy size={13} /> Template</Link>
            <button onClick={() => { if (confirm(`Delete "${wf.name}"?`)) delWorkflow.mutate() }} className="btn btn-sm btn-ghost text-red-400"><Trash2 size={13} /></button>
          </div>
        </div>
        <p className="text-slate-500 text-xs mt-1">Created {formatDate(wf.created_at)} · Updated {formatDate(wf.updated_at)}</p>
      </div>

      {/* Outputs */}
      <div className="card mb-4">
        <h2 className="font-semibold mb-4">Output Versions</h2>
        {!hasOutputs ? (
          <p className="text-slate-500 text-sm">No outputs yet. Generate below.</p>
        ) : (
          <div className="space-y-2">
            {wf.outputs?.map(o => (
              <div key={o.id} className="flex items-center gap-3 py-2 border-b border-slate-800 last:border-0">
                <div className="flex-1">
                  <span className="text-sm font-medium text-slate-200">Version {o.version}</span>
                  {o.notes && <span className="text-xs text-slate-500 ml-2">{o.notes}</span>}
                  <span className="text-xs text-slate-600 ml-2">{formatDate(o.created_at)}</span>
                </div>
                <div className="flex gap-1.5">
                  {([['student', FileText, 'Student'], ['teacher', Key, 'Teacher Key'], ['slideshow', Monitor, 'Slideshow']] as const).map(([v, Icon, label]) => (
                    <button key={v} onClick={() => setModal({ outputId: o.id, variant: v, title: `v${o.version} — ${label}` })}
                      className="btn btn-sm btn-ghost text-xs gap-1">
                      <Icon size={11} />{label}
                    </button>
                  ))}
                  <button onClick={() => { if (confirm('Delete version?')) delOutput.mutate(o.id) }} className="btn btn-sm btn-ghost p-1.5 text-red-400"><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generate */}
      <div className="card mb-4">
        <h2 className="font-semibold mb-4">Generate New Version</h2>
        {genError && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-300 mb-4">{genError}</div>}

        {hasOutputs && (
          <div className="flex gap-4 mb-4">
            {(['revise', 'fresh'] as const).map(m => (
              <label key={m} className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" checked={mode === m} onChange={() => setMode(m)} />
                <span className="text-slate-300">{m === 'revise' ? 'Revise existing version' : 'Generate fresh'}</span>
              </label>
            ))}
          </div>
        )}

        {mode === 'revise' && hasOutputs && (
          <div className="space-y-3 mb-4">
            <div>
              <label className="label text-xs">Base on</label>
              <select className="input" value={baseOutputId ?? ''} onChange={e => setBaseOutputId(parseInt(e.target.value))}>
                {wf.outputs?.map(o => <option key={o.id} value={o.id}>Version {o.version} — {formatDate(o.created_at)}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">What to change</label>
              <textarea className="input" rows={3} value={revisionInstructions} onChange={e => setRevisionInstructions(e.target.value)} placeholder="Add a word bank, simplify instructions in section 2…" />
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="label text-xs">Versions to generate</label>
          <div className="flex gap-4">
            {[['student', 'Student'], ['teacher', 'Teacher Key'], ['slideshow', 'Slideshow']].map(([v, label]) => (
              <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={variants.includes(v)} onChange={() => toggleVariant(v)} />
                <span className="text-slate-300">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="label text-xs">Curriculum Docs</label>
          <div className="border border-slate-700 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
            {docs.map(d => (
              <label key={d.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-800 cursor-pointer border-b border-slate-800 last:border-0 text-sm">
                <input type="checkbox" checked={selectedDocs.includes(d.id)} onChange={() => toggleDoc(d.id)} />
                <span className="text-slate-300">{d.title ?? d.filename}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="label text-xs">Version label <span className="text-slate-500 font-normal">(optional)</span></label>
          <input className="input" value={versionLabel} onChange={e => setVersionLabel(e.target.value)} placeholder="e.g. Added word bank, simplified instructions" />
        </div>

        <div className="flex items-center gap-4">
          <button onClick={() => generate.mutate()} disabled={!!jobId || !variants.length || generate.isPending} className="btn">
            {jobId ? 'Generating…' : 'Generate'}
          </button>
          {jobId && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <div className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              {jobProgress}
              <span className="text-xs text-slate-600">· You can navigate away</span>
            </div>
          )}
        </div>
      </div>

      {/* Rubric */}
      <div className="card mb-4">
        <h2 className="font-semibold mb-2">Grading Rubric</h2>
        <p className="text-slate-500 text-xs mb-3">Used when grading submissions for this assignment via MARTY chat.</p>
        <textarea className="input font-mono text-xs" rows={10} value={rubric} onChange={e => setRubric(e.target.value)}
          placeholder={"Rubric — 100 points\n\n1. Claim (20 pts)\n   Full: ...\n   Partial: ...\n   None: ..."} />
        <div className="flex items-center gap-3 mt-3">
          <button onClick={() => saveRubric.mutate()} className="btn btn-sm"><Save size={12} /> Save Rubric</button>
          {rubricSaved && <span className="text-xs text-green-400">Saved!</span>}
          {!wf.rubric && <span className="text-xs text-slate-500">No rubric yet — grading won't work until one is saved.</span>}
        </div>
      </div>

      {/* Edit Details */}
      <div className="card">
        <h2 className="font-semibold mb-4">Edit Workflow Details</h2>
        <div className="space-y-4">
          <div><label className="label">Name</label><input className="input" value={editName} onChange={e => setEditName(e.target.value)} /></div>
          <div><label className="label">Context / Description</label><textarea className="input" rows={3} value={editContext} onChange={e => setEditContext(e.target.value)} /></div>
          <div><label className="label">Special Instructions</label><textarea className="input" rows={2} value={editInstructions} onChange={e => setEditInstructions(e.target.value)} /></div>
          <button onClick={() => saveDetails.mutate()} disabled={saveDetails.isPending} className="btn btn-sm">Save Changes</button>
        </div>
      </div>

      {modal && (
        <OutputModal
          workflowId={wfId}
          outputId={modal.outputId}
          variant={modal.variant}
          title={modal.title}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
