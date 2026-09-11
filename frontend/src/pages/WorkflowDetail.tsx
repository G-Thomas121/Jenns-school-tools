import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Key, Monitor, Download, Presentation, Trash2, MessageSquare, Save } from 'lucide-react'
import { getWorkflow, updateWorkflow, deleteOutput, downloadUrl, pptxUrl } from '../api'
import { useRevisionChat } from '../hooks/useRevisionChat'
import OutputModal from '../components/OutputModal'
import { formatDate, typeBadge, gradeBadge } from '../utils'
import type { OutputVariant } from '../types'

interface ModalState { outputId: number; variant: OutputVariant; title: string }

export default function WorkflowDetail() {
  const { id } = useParams<{ id: string }>()
  const wfId = parseInt(id!)
  const qc = useQueryClient()
  const startRevision = useRevisionChat()

  const { data: wf, isLoading } = useQuery({
    queryKey: ['workflow', wfId],
    queryFn: () => getWorkflow(wfId),
  })

  const [modal, setModal] = useState<ModalState | null>(null)
  const [rubric, setRubric] = useState('')
  const [rubricSaved, setRubricSaved] = useState(false)

  useEffect(() => {
    if (wf) setRubric(wf.rubric ?? '')
  }, [wf])

  const saveRubric = useMutation({
    mutationFn: () => updateWorkflow(wfId, { rubric: rubric || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow', wfId] })
      setRubricSaved(true)
      setTimeout(() => setRubricSaved(false), 2000)
    },
  })

  const delOutput = useMutation({
    mutationFn: (outId: number) => deleteOutput(wfId, outId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow', wfId] }),
  })

  if (isLoading) return <div className="p-8 text-slate-500">Loading…</div>
  if (!wf) return <div className="p-8 text-red-400">Workflow not found.</div>

  const latestOutputId = wf.outputs?.[0]?.id ?? null

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <Link to="/workflows" className="text-slate-500 text-sm hover:text-slate-300">← My Materials</Link>
        <div className="flex items-start justify-between mt-2 gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{wf.name}</h1>
              <span dangerouslySetInnerHTML={{ __html: typeBadge(wf.type) }} />
              <span dangerouslySetInnerHTML={{ __html: gradeBadge(wf.grade) }} />
            </div>
            <p className="text-slate-500 text-xs mt-1">
              Created {formatDate(wf.created_at)} · Updated {formatDate(wf.updated_at)}
            </p>
            {wf.context && <p className="text-slate-400 text-sm mt-2">{wf.context}</p>}
          </div>
          <button
            onClick={() => startRevision(wf, latestOutputId)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600/15 hover:bg-blue-600/25 text-blue-400 text-sm font-medium transition-colors flex-shrink-0"
          >
            <MessageSquare size={14} /> Revise in Chat
          </button>
        </div>
      </div>

      {/* Output versions */}
      <div className="card mb-4">
        <h2 className="font-semibold mb-4">Output Versions</h2>
        {!wf.outputs?.length ? (
          <div className="text-center py-8">
            <p className="text-slate-500 text-sm mb-3">No outputs yet.</p>
            <button
              onClick={() => startRevision(wf, null)}
              className="btn btn-sm"
            >
              <MessageSquare size={13} /> Generate in Chat
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {wf.outputs.map(o => (
              <div key={o.id} className="flex items-center gap-3 py-2.5 border-b border-slate-800 last:border-0">
                <div className="flex-1">
                  <span className="text-sm font-medium text-slate-200">Version {o.version}</span>
                  {o.notes && <span className="text-xs text-slate-500 ml-2">{o.notes}</span>}
                  <span className="text-xs text-slate-600 ml-2">{formatDate(o.created_at)}</span>
                </div>
                <div className="flex items-center gap-1">
                  {(['student', 'teacher', 'slideshow'] as OutputVariant[]).map(v => {
                    const icons = { student: FileText, teacher: Key, slideshow: Monitor }
                    const labels = { student: 'Student', teacher: 'Teacher Key', slideshow: 'Slideshow' }
                    const Icon = icons[v]
                    return (
                      <button key={v}
                        onClick={() => setModal({ outputId: o.id, variant: v, title: `v${o.version} — ${labels[v]}` })}
                        className="btn btn-sm btn-ghost text-xs gap-1 px-2">
                        <Icon size={11} />{labels[v]}
                      </button>
                    )
                  })}
                  <a href={pptxUrl(o.id)} download className="btn btn-sm btn-ghost p-1.5 text-slate-400 hover:text-blue-400" title="PPTX">
                    <Presentation size={12} />
                  </a>
                  <a href={downloadUrl(o.id, 'student')} download className="btn btn-sm btn-ghost p-1.5 text-slate-400" title="HTML">
                    <Download size={12} />
                  </a>
                  <button
                    onClick={() => { if (confirm('Delete this version?')) delOutput.mutate(o.id) }}
                    className="btn btn-sm btn-ghost p-1.5 text-slate-600 hover:text-red-400"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rubric */}
      <div className="card">
        <h2 className="font-semibold mb-1">Grading Rubric</h2>
        <p className="text-slate-500 text-xs mb-3">
          Used when MARTY grades submissions for this assignment.
        </p>
        <textarea
          className="input font-mono text-xs"
          rows={10}
          value={rubric}
          onChange={e => setRubric(e.target.value)}
          placeholder={"Rubric — 100 points\n\n1. Claim (20 pts)\n   Full: ...\n   Partial: ...\n   None: ..."}
        />
        <div className="flex items-center gap-3 mt-3">
          <button onClick={() => saveRubric.mutate()} disabled={saveRubric.isPending} className="btn btn-sm">
            <Save size={12} /> Save Rubric
          </button>
          {rubricSaved && <span className="text-xs text-green-400">Saved!</span>}
          {!wf.rubric && <span className="text-xs text-slate-600">No rubric yet.</span>}
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
