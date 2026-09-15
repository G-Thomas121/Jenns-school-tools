import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ChevronDown, ChevronRight, FileText, Key, Monitor, Download,
  Presentation, MessageSquare, Trash2, Printer, BookOpen,
} from 'lucide-react'
import { getTopics, getWorkflows, deleteWorkflow, deleteTopic, downloadUrl, printUrl, pptxUrl } from '../api'
import { useTopicChat, useRevisionChat } from '../hooks/useRevisionChat'
import OutputModal from '../components/OutputModal'
import { formatDate, gradeBadge } from '../utils'
import type { LessonTopic, TopicWorkflow, Workflow, OutputVariant } from '../types'

interface ModalState { workflowId: number; outputId: number; variant: OutputVariant; title: string }

const TYPE_LABEL: Record<string, string> = {
  lesson_plan: 'Lesson Plan', slideshow: 'Slideshow', worksheet: 'Worksheet',
  foldable: 'Foldable', bell_ringer: 'Bell Ringer', exit_ticket: 'Exit Ticket',
  study_guide: 'Study Guide', custom: 'Custom',
}

const TYPE_ICON: Record<string, string> = {
  lesson_plan: '📋', slideshow: '🖥', worksheet: '📝',
  foldable: '📂', bell_ringer: '🔔', exit_ticket: '🎟',
  study_guide: '📚', custom: '✏️',
}

function MaterialActions({ wf, onView }: {
  wf: TopicWorkflow
  onView: (outId: number, v: OutputVariant, name: string) => void
}) {
  if (!wf.latest_output_id) return <span className="text-xs text-slate-600">No output yet</span>

  const id = wf.latest_output_id
  const name = wf.name

  if (wf.type === 'lesson_plan') {
    return (
      <div className="flex items-center gap-1">
        <button onClick={() => onView(id, 'student', name)} className="btn btn-sm btn-ghost p-1.5 text-slate-400 hover:text-slate-100" title="View">
          <FileText size={12} />
        </button>
        <a href={printUrl(id, 'student')} target="_blank" rel="noreferrer" className="btn btn-sm btn-ghost p-1.5 text-emerald-600 hover:text-emerald-400" title="Print/PDF">
          <Printer size={12} />
        </a>
        <a href={downloadUrl(id, 'student')} download className="btn btn-sm btn-ghost p-1.5 text-slate-500 hover:text-slate-300" title="Download HTML">
          <Download size={12} />
        </a>
      </div>
    )
  }

  if (wf.type === 'slideshow') {
    return (
      <div className="flex items-center gap-1">
        <button onClick={() => onView(id, 'slideshow', name)} className="btn btn-sm btn-ghost p-1.5 text-slate-400 hover:text-slate-100" title="View slides">
          <Monitor size={12} />
        </button>
        <a href={printUrl(id, 'slideshow')} target="_blank" rel="noreferrer" className="btn btn-sm btn-ghost p-1.5 text-emerald-600 hover:text-emerald-400" title="Print/PDF">
          <Printer size={12} />
        </a>
        <a href={pptxUrl(id)} download className="btn btn-sm btn-ghost p-1.5 text-blue-500 hover:text-blue-300" title="Export PPTX">
          <Presentation size={12} />
        </a>
        <a href={downloadUrl(id, 'slideshow')} download className="btn btn-sm btn-ghost p-1.5 text-slate-500 hover:text-slate-300" title="Download HTML">
          <Download size={12} />
        </a>
      </div>
    )
  }

  // worksheet, foldable, bell_ringer, exit_ticket, etc.
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onView(id, 'student', name)} className="btn btn-sm btn-ghost p-1.5 text-slate-400 hover:text-slate-100" title="Student version">
        <FileText size={12} />
      </button>
      <button onClick={() => onView(id, 'teacher', name)} className="btn btn-sm btn-ghost p-1.5 text-slate-400 hover:text-yellow-400" title="Teacher key">
        <Key size={12} />
      </button>
      <a href={printUrl(id, 'student')} target="_blank" rel="noreferrer" className="btn btn-sm btn-ghost p-1.5 text-emerald-600 hover:text-emerald-400" title="Print/PDF">
        <Printer size={12} />
      </a>
      <a href={downloadUrl(id, 'student')} download className="btn btn-sm btn-ghost p-1.5 text-slate-500 hover:text-slate-300" title="Download HTML">
        <Download size={12} />
      </a>
    </div>
  )
}

function TopicCard({ topic, onView }: {
  topic: LessonTopic
  onView: (outId: number, v: OutputVariant, title: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const qc = useQueryClient()
  const openTopicChat = useTopicChat()

  const del = useMutation({
    mutationFn: () => deleteTopic(topic.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['topics'] }),
  })

  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden mb-3">
      {/* Topic header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 hover:bg-slate-800/60 transition-colors">
        <button onClick={() => setExpanded(!expanded)} className="text-slate-500 hover:text-slate-300 flex-shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button onClick={() => setExpanded(!expanded)} className="flex-1 text-left min-w-0">
          <p className="text-sm font-semibold text-slate-100 truncate">{topic.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span dangerouslySetInnerHTML={{ __html: gradeBadge(topic.grade) }} />
            <span className="text-xs text-slate-600">{topic.workflows.length} material{topic.workflows.length !== 1 ? 's' : ''}</span>
            <span className="text-xs text-slate-700">· {formatDate(topic.updated_at)}</span>
          </div>
        </button>
        <div className="flex gap-1.5 flex-shrink-0">
          <button
            onClick={() => openTopicChat(topic)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/15 hover:bg-blue-600/25 text-blue-400 text-xs font-medium transition-colors"
          >
            <MessageSquare size={12} /> Open in Chat
          </button>
          <button
            onClick={() => { if (confirm(`Delete lesson "${topic.name}" and unlink its materials?`)) del.mutate() }}
            className="btn btn-sm btn-ghost p-1.5 text-slate-600 hover:text-red-400"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Materials list */}
      {expanded && (
        <div className="divide-y divide-slate-800/60">
          {topic.workflows.length === 0 ? (
            <p className="px-6 py-3 text-xs text-slate-600">No materials yet — open in chat to start building.</p>
          ) : topic.workflows.map(wf => (
            <div key={wf.id} className="flex items-center gap-3 px-5 py-2.5 bg-slate-950/40 hover:bg-slate-900/30 transition-colors">
              <span className="text-base flex-shrink-0">{TYPE_ICON[wf.type] ?? '📄'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-300 truncate">{wf.name}</p>
                <p className="text-xs text-slate-600">{TYPE_LABEL[wf.type] ?? wf.type}</p>
              </div>
              <MaterialActions wf={wf} onView={(outId, v, name) => onView(outId, v, name)} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function OrphanedRow({ wf, onView }: { wf: TopicWorkflow; onView: (outId: number, v: OutputVariant, name: string) => void }) {
  return (
    <div className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-800 last:border-0 hover:bg-slate-800/20 transition-colors">
      <span className="text-base flex-shrink-0">{TYPE_ICON[wf.type] ?? '📄'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-300 truncate">{wf.name}</p>
        <p className="text-xs text-slate-600">{TYPE_LABEL[wf.type] ?? wf.type} · {formatDate(wf.updated_at)}</p>
      </div>
      <MaterialActions wf={wf} onView={onView} />
    </div>
  )
}

export default function Workflows() {
  const { data, isLoading } = useQuery({ queryKey: ['topics'], queryFn: getTopics })
  const [modal, setModal] = useState<ModalState | null>(null)
  const [search, setSearch] = useState('')
  const [showOrphaned, setShowOrphaned] = useState(false)

  const topics = data?.topics ?? []
  const orphaned = data?.orphaned ?? []

  const filteredTopics = topics.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.workflows.some(w => w.name.toLowerCase().includes(search.toLowerCase()))
  )
  const filteredOrphaned = orphaned.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase())
  )

  const openModal = (outId: number, v: OutputVariant, title: string) =>
    setModal({ workflowId: 0, outputId: outId, variant: v, title })

  if (isLoading) return <div className="p-8 text-slate-500">Loading…</div>

  const isEmpty = topics.length === 0 && orphaned.length === 0

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">My Lessons</h1>
      </div>
      <p className="text-slate-400 text-sm mb-6">
        Everything MARTY has built, organized by lesson. Open any lesson in chat to add materials or revise.
      </p>

      {isEmpty ? (
        <div className="card text-center py-16">
          <p className="text-slate-500 mb-2">Nothing here yet.</p>
          <p className="text-slate-600 text-sm">Start a chat with MARTY to build your first lesson day package.</p>
          <Link to="/chat" className="btn mt-6 inline-flex">Chat with MARTY</Link>
        </div>
      ) : (
        <>
          <input
            className="input mb-5 max-w-xs"
            placeholder="Search lessons…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          {filteredTopics.length === 0 && filteredOrphaned.length === 0 ? (
            <p className="text-slate-500 text-sm">No results for "{search}"</p>
          ) : (
            <>
              {filteredTopics.map(topic => (
                <TopicCard key={topic.id} topic={topic} onView={openModal} />
              ))}

              {filteredOrphaned.length > 0 && (
                <div className="mt-4">
                  <button
                    onClick={() => setShowOrphaned(!showOrphaned)}
                    className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-400 mb-2 transition-colors"
                  >
                    {showOrphaned ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    Previous materials ({filteredOrphaned.length})
                  </button>
                  {showOrphaned && (
                    <div className="card p-0 overflow-hidden">
                      {filteredOrphaned.map(wf => (
                        <OrphanedRow key={wf.id} wf={wf} onView={openModal} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
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
