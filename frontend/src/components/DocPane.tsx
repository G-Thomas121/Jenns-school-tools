import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Brain, Check, Copy, FileText, Folder, Pencil, Printer, X } from 'lucide-react'
import { getFile, getFiles, saveFile } from '../api'
import { DocumentMarkdown } from './Markdown'

const MEMORY_FILE = 'MARTY.md'

interface Props {
  path: string | null
  onOpen: (path: string | null) => void
  running: boolean
}

export default function DocPane({ path, onOpen, running }: Props) {
  return (
    <aside className="w-[52%] min-w-[420px] flex-shrink-0 border-l border-slate-800 bg-slate-900 flex flex-col">
      {path ? <FileView path={path} onBack={() => onOpen(null)} running={running} /> : <FileBrowser onOpen={onOpen} />}
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

function FileBrowser({ onOpen }: { onOpen: (path: string) => void }) {
  const { data: files = [] } = useQuery({ queryKey: ['files'], queryFn: getFiles, refetchInterval: 10_000 })
  const tree = buildTree(files.filter(f => f !== MEMORY_FILE))
  const lessons = tree.children.get('lessons')
  const curriculum = tree.children.get('curriculum')

  return (
    <>
      <div className="px-5 py-3.5 border-b border-slate-800 text-sm font-semibold text-slate-300">Workspace</div>
      <div className="flex-1 overflow-y-auto p-3 space-y-5 text-sm">
        <button onClick={() => onOpen(MEMORY_FILE)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-200">
          <Brain size={14} className="text-purple-400" /> MARTY's memory
          <span className="ml-auto text-xs text-slate-500">what MARTY knows about you</span>
        </button>
        <Section title="Lessons" node={lessons} onOpen={onOpen} empty="Nothing yet — ask MARTY for a lesson plan to get started." />
        <Section title="Curriculum" node={curriculum} onOpen={onOpen} empty="Upload reference files with the button in the sidebar." />
      </div>
    </>
  )
}

function Section({ title, node, onOpen, empty }: { title: string; node?: TreeNode; onOpen: (p: string) => void; empty: string }) {
  const hasFiles = node && node.children.size > 0
  return (
    <div>
      <div className="px-3 pb-1.5 text-xs font-semibold text-slate-500 uppercase tracking-widest">{title}</div>
      {hasFiles ? <TreeChildren node={node} onOpen={onOpen} depth={0} /> : <p className="px-3 text-xs text-slate-500">{empty}</p>}
    </div>
  )
}

function TreeChildren({ node, onOpen, depth }: { node: TreeNode; onOpen: (p: string) => void; depth: number }) {
  const children = [...node.children.values()].sort((a, b) =>
    (a.children.size ? 0 : 1) - (b.children.size ? 0 : 1) || a.name.localeCompare(b.name))
  return (
    <ul>
      {children.map(child => (
        <li key={child.path}>
          {child.children.size ? (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 text-slate-400" style={{ paddingLeft: 12 + depth * 14 }}>
                <Folder size={13} className="text-slate-500" /> {prettyName(child.name)}
              </div>
              <TreeChildren node={child} onOpen={onOpen} depth={depth + 1} />
            </>
          ) : (
            <button
              onClick={() => onOpen(child.path)}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left text-slate-300 hover:bg-slate-800 hover:text-white"
              style={{ paddingLeft: 12 + depth * 14 }}
            >
              <FileText size={13} className="text-blue-400 flex-shrink-0" /> <span className="truncate">{child.name}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

function prettyName(slug: string) {
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── Viewer / editor ────────────────────────────────────────────────────────────

function FileView({ path, onBack, running }: { path: string; onBack: () => void; running: boolean }) {
  const qc = useQueryClient()
  const { data, error } = useQuery({ queryKey: ['file', path], queryFn: () => getFile(path) })
  const [draft, setDraft] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const docRef = useRef<HTMLDivElement>(null)
  const isMarkdown = path.endsWith('.md')
  const editable = isMarkdown && !path.startsWith('curriculum/')

  useEffect(() => setDraft(null), [path])

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
        {draft === null ? (
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
          </>
        ) : (
          <>
            <button onClick={() => setDraft(null)} className="btn btn-ghost btn-sm"><X size={13} /> Cancel</button>
            <button onClick={() => save.mutate(draft)} disabled={save.isPending} className="btn btn-sm">
              <Check size={13} /> {save.isPending ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-800/40 p-6">
        {error ? (
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
              {data && (isMarkdown
                ? <DocumentMarkdown>{data.content}</DocumentMarkdown>
                : <pre className="whitespace-pre-wrap text-sm text-slate-800 font-sans">{data.content}</pre>)}
            </div>
          </div>
        )}
        {save.error && <p className="mt-2 text-sm text-red-400">{(save.error as Error).message}</p>}
      </div>
    </>
  )
}
