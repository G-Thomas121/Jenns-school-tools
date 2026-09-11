import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, FileText, Key, Monitor, Download, Presentation, MessageSquare, Trash2, BookOpen } from 'lucide-react'
import { getWorkflows, getWorkflow, deleteWorkflow, downloadUrl, pptxUrl } from '../api'
import { useRevisionChat } from '../hooks/useRevisionChat'
import OutputModal from '../components/OutputModal'
import { formatDate, typeBadge, gradeBadge } from '../utils'
import type { Workflow, OutputSummary, OutputVariant } from '../types'

interface ModalState { workflowId: number; outputId: number; variant: OutputVariant; title: string }

function OutputRow({ workflowId, output, onView }: {
  workflowId: number
  output: OutputSummary
  onView: (outId: number, variant: OutputVariant) => void
}) {
  return (
    <div className="flex items-center gap-3 py-2 pl-8 border-b border-slate-800/60 last:border-0 bg-slate-900/40">
      <span className="text-xs text-slate-500 w-16">v{output.version}</span>
      {output.notes && <span className="text-xs text-slate-500 flex-1 truncate">{output.notes}</span>}
      <span className="text-xs text-slate-600 ml-auto mr-2">{formatDate(output.created_at)}</span>
      <div className="flex gap-1">
        {(['student', 'teacher', 'slideshow'] as OutputVariant[]).map(v => {
          const icons = { student: FileText, teacher: Key, slideshow: Monitor }
          const Icon = icons[v]
          return (
            <button key={v} onClick={() => onView(output.id, v)}
              className="btn btn-sm btn-ghost p-1.5 text-slate-400 hover:text-slate-100" title={v}>
              <Icon size={12} />
            </button>
          )
        })}
        <a href={pptxUrl(output.id)} download className="btn btn-sm btn-ghost p-1.5 text-slate-400 hover:text-blue-400" title="Export PPTX">
          <Presentation size={12} />
        </a>
        <a href={downloadUrl(output.id, 'student')} download className="btn btn-sm btn-ghost p-1.5 text-slate-400 hover:text-slate-100" title="Download HTML">
          <Download size={12} />
        </a>
      </div>
    </div>
  )
}

function WorkflowRow({ wf, onView }: { wf: Workflow; onView: (wfId: number, outId: number, v: OutputVariant) => void }) {
  const [expanded, setExpanded] = useState(false)
  const qc = useQueryClient()
  const startRevision = useRevisionChat()

  const { data: detail } = useQuery({
    queryKey: ['workflow', wf.id],
    queryFn: () => getWorkflow(wf.id),
    enabled: expanded,
  })

  const del = useMutation({
    mutationFn: () => deleteWorkflow(wf.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  })

  const latestOutputId = detail?.outputs?.[0]?.id ?? null

  return (
    <div className="border-b border-slate-800 last:border-0">
      {/* Main row */}
      <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-800/20 transition-colors">
        <button onClick={() => setExpanded(!expanded)} className="text-slate-500 hover:text-slate-300 flex-shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className="flex-1 min-w-0">
          <button onClick={() => setExpanded(!expanded)} className="text-left w-full">
            <p className="text-sm font-medium text-slate-200 truncate">{wf.name}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span dangerouslySetInnerHTML={{ __html: typeBadge(wf.type) }} />
              <span dangerouslySetInnerHTML={{ __html: gradeBadge(wf.grade) }} />
              <span className="text-xs text-slate-600">{wf.output_count ?? 0} version{wf.output_count !== 1 ? 's' : ''}</span>
              <span className="text-xs text-slate-700">· {formatDate(wf.updated_at)}</span>
            </div>
          </button>
        </div>

        <div className="flex gap-1.5 flex-shrink-0">
          <button
            onClick={() => startRevision(wf, latestOutputId)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/15 hover:bg-blue-600/25 text-blue-400 text-xs font-medium transition-colors"
          >
            <MessageSquare size={12} /> Revise in Chat
          </button>
          <Link to={`/workflows/${wf.id}`} className="btn btn-sm btn-ghost p-1.5 text-slate-500" title="Details & rubric">
            <BookOpen size={13} />
          </Link>
          <button
            onClick={() => { if (confirm(`Delete "${wf.name}"?`)) del.mutate() }}
            className="btn btn-sm btn-ghost p-1.5 text-slate-600 hover:text-red-400"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Expanded outputs */}
      {expanded && (
        <div>
          {!detail ? (
            <div className="pl-8 py-3 text-xs text-slate-600">Loading…</div>
          ) : detail.outputs?.length === 0 ? (
            <div className="pl-8 py-3 text-xs text-slate-600">No outputs yet. Revise in chat to generate.</div>
          ) : detail.outputs?.map(o => (
            <OutputRow key={o.id} workflowId={wf.id} output={o} onView={(outId, v) => onView(wf.id, outId, v)} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Workflows() {
  const { data: workflows = [], isLoading } = useQuery({ queryKey: ['workflows'], queryFn: getWorkflows })
  const [modal, setModal] = useState<ModalState | null>(null)
  const [search, setSearch] = useState('')

  const filtered = workflows.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    w.type.includes(search.toLowerCase())
  )

  if (isLoading) return <div className="p-8 text-slate-500">Loading…</div>

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">My Materials</h1>
      </div>
      <p className="text-slate-400 text-sm mb-6">
        Everything MARTY has created. Click a row to see versions — or jump straight to chat to revise.
      </p>

      {workflows.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-slate-500 mb-2">Nothing here yet.</p>
          <p className="text-slate-600 text-sm">Start a chat with MARTY to create your first worksheet, lesson plan, or slideshow.</p>
          <Link to="/chat" className="btn mt-6 inline-flex">Chat with MARTY</Link>
        </div>
      ) : (
        <>
          <input
            className="input mb-4 max-w-xs"
            placeholder="Search materials…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="card p-0 overflow-hidden">
            {filtered.length === 0 ? (
              <p className="px-5 py-8 text-slate-500 text-sm text-center">No results for "{search}"</p>
            ) : filtered.map(wf => (
              <WorkflowRow
                key={wf.id}
                wf={wf}
                onView={(wfId, outId, v) => setModal({ workflowId: wfId, outputId: outId, variant: v, title: `${wf.name} — ${v}` })}
              />
            ))}
          </div>
        </>
      )}

      {modal && (
        <OutputModal
          workflowId={modal.workflowId}
          outputId={modal.outputId}
          variant={modal.variant}
          title={modal.title}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
