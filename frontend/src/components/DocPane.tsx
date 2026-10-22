import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Brain, Check, ChevronDown, ChevronRight, Copy, FileText, Folder, FolderUp, Maximize2, Minimize2, Pencil, Presentation, Printer, Upload, X } from 'lucide-react'
import { describeUpload, downloadPptx, getFile, getFiles, saveFile, uploadFiles } from '../api'
import type { Draft } from '../types'
import { DocumentMarkdown } from './Markdown'

const MEMORY_FILE = 'MARTY.md'

interface Props {
  path: string | null
  onOpen: (path: string | null) => void
  running: boolean
  draft: Draft | null
}

export default function DocPane({ path, onOpen, running, draft }: Props) {
  // Full screen covers the chat so the whole document has room; Esc brings the chat back.
  const [full, setFull] = useState(false)
  const expanded = full && path !== null

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  return (
    <aside className={expanded
      ? 'fixed inset-0 z-50 bg-slate-900 flex flex-col'
      : 'w-[52%] min-w-[420px] flex-shrink-0 border-l border-slate-800 bg-slate-900 flex flex-col'}>
      {path
        ? <FileView path={path} onBack={() => { setFull(false); onOpen(null) }} running={running}
            live={draft?.path === path ? draft : null} full={expanded} onToggleFull={() => setFull(f => !f)} />
        : <FileBrowser onOpen={onOpen} />}
    </aside>
  )
}

// ── Browser ────────────────────────────────────────────────────────────────────

interface TreeNode { name: string; path: string; children: Map<string, TreeNode> }

function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: '', path: '', children: new Map() }
  for (const p of paths) {
    let node = root
    p.split('/').forEach((part, i, parts) => {
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, path: parts.slice(0, i + 1).join('/'), children: new Map() })
      }
      node = node.children.get(part)!
    })
  }
  return root
}

// Folders Jenn has opened or closed, kept across visits. Uploaded sources/ folders start
// closed so a stack of PDFs doesn't push the lesson's own files off screen.
const COLLAPSE_KEY = 'marty.collapsedFolders'

function loadCollapsed(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '{}') } catch { return {} }
}

function useCollapsed() {
  const [overrides, setOverrides] = useState(loadCollapsed)
  const isCollapsed = (node: TreeNode) => overrides[node.path] ?? node.name === 'sources'
  const toggle = (node: TreeNode) => setOverrides(prev => {
    const next = { ...prev, [node.path]: !isCollapsed(node) }
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)) } catch { /* private window */ }
    return next
  })
  return { isCollapsed, toggle }
}

type UploadTo = (files: File[], lesson?: string) => void

function FileBrowser({ onOpen }: { onOpen: (path: string) => void }) {
  const qc = useQueryClient()
  const { data: files = [] } = useQuery({ queryKey: ['files'], queryFn: getFiles, refetchInterval: 10_000 })
  const tree = buildTree(files.filter(f => f !== MEMORY_FILE))
  const lessons = tree.children.get('lessons')
  const curriculum = tree.children.get('curriculum')
  const collapse = useCollapsed()
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null)

  const upload = useMutation({
    mutationFn: ({ files, lesson }: { files: File[]; lesson?: string }) => uploadFiles(files, lesson),
    onMutate: ({ files }) => setStatus({ msg: `Uploading ${files.length} file${files.length === 1 ? '' : 's'}…`, ok: true }),
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: ['files'] })
      setStatus({ msg: describeUpload(result), ok: true })
    },
    onError: (e: Error) => setStatus({ msg: `Upload failed: ${e.message}`, ok: false }),
  })
  const uploadTo: UploadTo = (files, lesson) => upload.mutate({ files, lesson })

  const newLessonFromFolder = (files: File[]) => {
    const folder = files[0]?.webkitRelativePath.split('/')[0] ?? ''
    const lesson = prompt('Which lesson are these files for? (a new or existing lesson name)', folder)
    if (lesson?.trim()) uploadTo(files, lesson.trim())
  }

  return (
    <>
      <div className="px-5 py-3.5 border-b border-slate-800 text-sm font-semibold text-slate-300">Workspace</div>
      {status && (
        <div className={`mx-3 mt-3 text-xs px-3 py-2 rounded-md flex items-start gap-2 ${
          status.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          <span className="flex-1 break-words">{status.msg}</span>
          {!upload.isPending && <button onClick={() => setStatus(null)} className="opacity-60 hover:opacity-100"><X size={12} /></button>}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3 space-y-5 text-sm">
        <button onClick={() => onOpen(MEMORY_FILE)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-200">
          <Brain size={14} className="text-purple-400" /> MARTY's memory
          <span className="ml-auto text-xs text-slate-500">what MARTY knows about you</span>
        </button>
        <Section
          title="Lessons" node={lessons} onOpen={onOpen} collapse={collapse} uploadTo={uploadTo}
          empty="Nothing yet — ask MARTY for a lesson plan to get started."
          actions={<UploadPicker folder title="Upload a folder of materials for a lesson" disabled={upload.isPending} onPick={newLessonFromFolder} />}
        />
        <Section
          title="Curriculum" node={curriculum} onOpen={onOpen} collapse={collapse}
          empty="Shared reference files (TEKS, unit plans) that aren't tied to one lesson."
          actions={<>
            <UploadPicker title="Upload files to curriculum" disabled={upload.isPending} onPick={fs => uploadTo(fs)} />
            <UploadPicker folder title="Upload a folder to curriculum" disabled={upload.isPending} onPick={fs => uploadTo(fs)} />
          </>}
        />
      </div>
    </>
  )
}

function UploadPicker({ folder = false, title, disabled, onPick }: {
  folder?: boolean; title: string; disabled: boolean; onPick: (files: File[]) => void
}) {
  const Icon = folder ? FolderUp : Upload
  return (
    <label title={title} className={`p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 cursor-pointer ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
      onClick={e => e.stopPropagation()}>
      <Icon size={13} />
      <input
        type="file" multiple className="hidden" accept={folder ? undefined : '.pdf,.docx,.txt,.md'}
        // React doesn't know the folder-picker attribute, so set it on the element directly.
        ref={el => { if (el && folder) el.setAttribute('webkitdirectory', '') }}
        onChange={e => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) onPick(fs) }}
      />
    </label>
  )
}

interface TreeProps {
  onOpen: (p: string) => void
  collapse: ReturnType<typeof useCollapsed>
  uploadTo?: UploadTo  // set for the Lessons tree: lesson folders accept uploads
}

function Section({ title, node, empty, actions, ...tree }: TreeProps & { title: string; node?: TreeNode; empty: string; actions: React.ReactNode }) {
  const hasFiles = node && node.children.size > 0
  return (
    <div>
      <div className="flex items-center px-3 pb-1.5">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{title}</span>
        <span className="ml-auto flex items-center gap-0.5">{actions}</span>
      </div>
      {hasFiles ? <TreeChildren node={node} depth={0} {...tree} /> : <p className="px-3 text-xs text-slate-500">{empty}</p>}
    </div>
  )
}

function countFiles(node: TreeNode): number {
  return node.children.size ? [...node.children.values()].reduce((n, c) => n + countFiles(c), 0) : 1
}

function TreeChildren({ node, depth, ...tree }: TreeProps & { node: TreeNode; depth: number }) {
  const { onOpen, collapse, uploadTo } = tree
  const children = [...node.children.values()].sort((a, b) =>
    (a.children.size ? 0 : 1) - (b.children.size ? 0 : 1) || a.name.localeCompare(b.name))
  return (
    <ul>
      {children.map(child => {
        if (!child.children.size) {
          return (
            <li key={child.path}>
              <button
                onClick={() => onOpen(child.path)}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left text-slate-300 hover:bg-slate-800 hover:text-white"
                style={{ paddingLeft: 12 + depth * 14 + 15 }}
              >
                <FileText size={13} className="text-blue-400 flex-shrink-0" /> <span className="truncate">{child.name}</span>
              </button>
            </li>
          )
        }
        const collapsed = collapse.isCollapsed(child)
        const Chevron = collapsed ? ChevronRight : ChevronDown
        // Only a lesson's own folder (lessons/<slug>) takes uploads; they land in its sources/.
        const lesson = uploadTo && depth === 0 ? child.name : null
        return (
          <li key={child.path}>
            <div
              role="button" tabIndex={0} aria-expanded={!collapsed}
              onClick={() => collapse.toggle(child)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); collapse.toggle(child) } }}
              className="group w-full flex items-center gap-1.5 px-3 py-1.5 rounded-md text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 cursor-pointer select-none"
              style={{ paddingLeft: 12 + depth * 14 }}
            >
              <Chevron size={13} className="text-slate-500 flex-shrink-0" />
              <Folder size={13} className="text-slate-500 flex-shrink-0" />
              <span className="truncate">{prettyName(child.name)}</span>
              {collapsed && <span className="text-xs text-slate-600">{countFiles(child)}</span>}
              {lesson && (
                <span className="ml-auto opacity-0 group-hover:opacity-100 flex">
                  <UploadPicker folder title={`Upload a folder of materials to ${prettyName(lesson)}`} disabled={false}
                    onPick={fs => uploadTo!(fs, lesson)} />
                </span>
              )}
            </div>
            {!collapsed && <TreeChildren node={child} depth={depth + 1} {...tree} />}
          </li>
        )
      })}
    </ul>
  )
}

function prettyName(slug: string) {
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── Viewer / editor ────────────────────────────────────────────────────────────

function FileView({ path, onBack, running, live, full, onToggleFull }: {
  path: string; onBack: () => void; running: boolean; live: Draft | null; full: boolean; onToggleFull: () => void
}) {
  const qc = useQueryClient()
  // A brand-new file 404s until MARTY finishes writing it; the live draft covers that gap.
  const { data, error } = useQuery({ queryKey: ['file', path], queryFn: () => getFile(path), retry: false })
  const [draft, setDraft] = useState<string | null>(null)  // Jenn's own unsaved edit
  const [copied, setCopied] = useState(false)
  const docRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isMarkdown = path.endsWith('.md')
  const editable = isMarkdown && !path.startsWith('curriculum/') && !/^lessons\/[^/]+\/sources\//.test(path)
  const content = live?.content ?? data?.content
  const writing = live?.content != null

  useEffect(() => setDraft(null), [path])

  // Follow the end of the document while MARTY writes it.
  useEffect(() => {
    if (writing && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [writing, live?.content])

  const save = useMutation({
    mutationFn: (content: string) => saveFile(path, content),
    onSuccess: (saved) => {
      qc.setQueryData(['file', path], saved)
      setDraft(null)
    },
  })

  // Copies formatted text (pastes with headings/lists/tables into Canva, Docs, etc.),
  // with plain text as the fallback for places that don't accept rich text.
  const copy = async () => {
    const el = docRef.current
    if (!el) return
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([el.innerHTML], { type: 'text/html' }),
        'text/plain': new Blob([el.innerText], { type: 'text/plain' }),
      })])
    } catch {
      await navigator.clipboard.writeText(el.innerText)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-800">
        <button onClick={onBack} className="btn btn-ghost btn-sm" title="All files"><ArrowLeft size={14} /></button>
        <span className="text-sm text-slate-300 truncate flex-1" title={path}>
          {path === MEMORY_FILE ? "MARTY's memory" : path}
        </span>
        {live && (
          <span className="flex items-center gap-1.5 text-xs text-blue-300 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 pulse-1" />
            MARTY is {writing ? 'writing' : 'editing'}…
          </span>
        )}
        {live ? null : draft === null ? (
          <>
            {editable && (
              <button onClick={() => setDraft(data?.content ?? '')} disabled={running || !data} className="btn btn-ghost btn-sm"
                title={running ? 'Wait for MARTY to finish' : 'Edit this file yourself'}>
                <Pencil size={13} /> Edit
              </button>
            )}
            <button onClick={copy} disabled={!data} className="btn btn-ghost btn-sm" title="Copy formatted text">
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
            </button>
            <button onClick={() => window.print()} disabled={!data} className="btn btn-ghost btn-sm"><Printer size={13} /> Print</button>
            {path.endsWith('slides.md') && (
              <button
                onClick={() => downloadPptx(path).catch((e: Error) => alert(e.message))} disabled={!data}
                className="btn btn-ghost btn-sm"
                title="Download as PowerPoint. In Canva, drag the file onto the home page (or Create a design → Import file) to get an editable design."
              >
                <Presentation size={13} /> Canva (.pptx)
              </button>
            )}
          </>
        ) : (
          <>
            <button onClick={() => setDraft(null)} className="btn btn-ghost btn-sm"><X size={13} /> Cancel</button>
            <button onClick={() => save.mutate(draft)} disabled={save.isPending} className="btn btn-sm">
              <Check size={13} /> {save.isPending ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
        <button onClick={onToggleFull} className="btn btn-ghost btn-sm"
          title={full ? 'Exit full screen (Esc)' : 'Full screen'} aria-label={full ? 'Exit full screen' : 'Full screen'}>
          {full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-slate-800/40 p-6">
        {error && !live ? (
          <p className="text-sm text-red-400">{(error as Error).message}</p>
        ) : draft !== null ? (
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="input font-mono text-[13px] leading-relaxed h-full min-h-[60vh] resize-none"
            autoFocus
          />
        ) : (
          <div className="print-area mx-auto max-w-[8.5in] bg-white rounded-md shadow-xl px-12 py-10">
            <div ref={docRef}>
              {content != null && (isMarkdown
                ? <DocumentMarkdown>{content}</DocumentMarkdown>
                : <pre className="whitespace-pre-wrap text-sm text-slate-800 font-sans">{content}</pre>)}
            </div>
          </div>
        )}
        {save.error && <p className="mt-2 text-sm text-red-400">{(save.error as Error).message}</p>}
      </div>
    </>
  )
}
