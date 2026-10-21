import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Brain, FileText, Pencil, Search, Send, Square } from 'lucide-react'
import { createConversation, sendMessage, stopConversation, streamUrl } from '../api'
import DocPane from '../components/DocPane'
import { ChatMarkdown } from '../components/Markdown'
import type { Draft, Message, StreamEvent } from '../types'

const STARTERS = [
  'Plan a 50-minute English 1 lesson on ',
  "Let's build a worksheet for the lesson plan in ",
  'Turn my lesson into a slide outline for Canva: ',
]

export default function Chat() {
  const { convId: convIdParam } = useParams()
  const convId = convIdParam ? parseInt(convIdParam) : null
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [messages, setMessages] = useState<Message[]>([])
  const [running, setRunning] = useState(false)
  const [liveText, setLiveText] = useState('')   // assistant text streaming in right now
  const [draft, setDraft] = useState<Draft | null>(null)  // document streaming in right now
  const [streamNonce, setStreamNonce] = useState(0)  // bump to (re)open the event stream
  const [input, setInput] = useState('')
  const [openPath, setOpenPath] = useState<string | null>(null)
  const lastId = useRef(0)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const addMessage = useCallback((m: Message) => {
    // Streams can overlap (StrictMode, reconnects) — skip rows already shown.
    if (m.id <= lastId.current) return
    lastId.current = m.id
    setMessages(prev => [...prev, m])
    if (m.display_role === 'assistant') setLiveText('')
    if (m.display_role === 'tool' && m.path) {
      qc.invalidateQueries({ queryKey: ['file', m.path] })
      qc.invalidateQueries({ queryKey: ['files'] })
      // Follow along: show whatever MARTY just wrote or edited.
      if (/^(Wrote|Edited) /.test(m.display_content)) {
        setOpenPath(m.path)
        setDraft(d => (d?.path === m.path ? null : d))
      }
    }
  }, [qc])

  // Fresh state for each conversation. (Declared before the stream effect so it runs first.)
  useEffect(() => {
    setMessages([])
    lastId.current = 0
    setRunning(false)
    setLiveText('')
    setDraft(null)
  }, [convId])

  // Each connection replays saved rows after lastId, reports whether MARTY is running,
  // streams live events if so, and ends with "done".
  useEffect(() => {
    if (!convId) return
    const es = new EventSource(streamUrl(convId, lastId.current))
    es.onmessage = e => {
      const ev = JSON.parse(e.data) as StreamEvent
      switch (ev.type) {
        case 'message': addMessage(ev.message); break
        case 'delta': setLiveText(t => t + ev.text); break
        case 'draft': setDraft({ path: ev.path, content: ev.content }); setOpenPath(ev.path); break
        case 'reset': setLiveText(''); setDraft(null); break
        case 'status': setRunning(ev.running); break
        case 'done':
          es.close()
          setRunning(false)
          setLiveText('')
          setDraft(null)
          qc.invalidateQueries({ queryKey: ['conversations'] })
          break
      }
    }
    return () => es.close()
  }, [convId, streamNonce, addMessage, qc])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, running, liveText])

  const send = async () => {
    const content = input.trim()
    if (!content || running) return
    setInput('')
    let id = convId
    try {
      if (!id) {
        id = (await createConversation()).id
        navigate(`/chat/${id}`)
        qc.invalidateQueries({ queryKey: ['conversations'] })
      }
      await sendMessage(id, content)
      setRunning(true)
      setStreamNonce(n => n + 1)
    } catch (e) {
      setInput(content)
      setMessages(prev => [...prev, {
        id: -Date.now(), display_role: 'error', path: null, created_at: '',
        display_content: `Couldn't reach MARTY — is the backend running? (${(e as Error).message})`,
      }])
    }
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 min-w-[360px] flex flex-col">
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 && !running ? (
            <EmptyState onPick={s => { setInput(s); inputRef.current?.focus() }} />
          ) : (
            <div className="px-6 py-6 space-y-3 max-w-3xl mx-auto">
              {messages.map(m => <MessageRow key={m.id} msg={m} onOpen={setOpenPath} />)}
              {liveText && <AssistantBubble text={liveText} />}
              {running && !liveText && <Working />}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-800">
          <div className="flex gap-3 items-end max-w-3xl mx-auto">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              rows={3}
              placeholder="Tell MARTY what you're teaching, or what to change…"
              className="flex-1 input resize-none"
            />
            {running ? (
              <button onClick={() => convId && stopConversation(convId)} className="btn btn-danger h-[78px] px-5" title="Stop MARTY">
                <Square size={16} />
              </button>
            ) : (
              <button onClick={send} disabled={!input.trim()} className="btn h-[78px] px-5"><Send size={16} /></button>
            )}
          </div>
        </div>
      </div>

      <DocPane path={openPath} onOpen={setOpenPath} running={running} draft={draft} />
    </div>
  )
}

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-8 text-center">
      <div className="w-12 h-12 rounded-full bg-blue-700 flex items-center justify-center text-lg font-bold mb-4">M</div>
      <h1 className="text-xl font-semibold mb-1">What are we teaching?</h1>
      <p className="text-sm text-slate-400 mb-6 max-w-md">
        Start with a lesson plan, then build worksheets, foldables, and slides on top of it — one draft at a time.
      </p>
      <div className="flex flex-col gap-2 w-full max-w-md">
        {STARTERS.map(s => (
          <button key={s} onClick={() => onPick(s)} className="text-left text-sm px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-blue-600 text-slate-300">
            {s}…
          </button>
        ))}
      </div>
    </div>
  )
}

function MessageRow({ msg, onOpen }: { msg: Message; onOpen: (path: string) => void }) {
  if (msg.display_role === 'user') {
    return (
      <div className="flex justify-end slide-up">
        <div className="bg-blue-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[80%] text-sm whitespace-pre-wrap">
          {msg.display_content}
        </div>
      </div>
    )
  }

  if (msg.display_role === 'assistant') return <AssistantBubble text={msg.display_content} />

  if (msg.display_role === 'tool') {
    const Icon = msg.path === 'MARTY.md' ? Brain
      : msg.display_content.startsWith('Searched') ? Search
      : /^(Wrote|Edited)/.test(msg.display_content) ? Pencil : FileText
    const inner = <><Icon size={12} className="flex-shrink-0" /><span className="truncate">{msg.display_content}</span></>
    return msg.path ? (
      <button onClick={() => onOpen(msg.path!)} className="ml-10 flex items-center gap-2 text-xs text-slate-400 hover:text-blue-300 max-w-full">
        {inner}
      </button>
    ) : (
      <div className="ml-10 flex items-center gap-2 text-xs text-slate-500">{inner}</div>
    )
  }

  return (
    <div className="ml-10 bg-red-950 border border-red-800 rounded-xl px-4 py-2.5 text-red-300 text-sm slide-up">
      {msg.display_content}
    </div>
  )
}

function AssistantBubble({ text }: { text: string }) {
  // No entry animation: the streamed bubble is swapped for the saved message when it lands.
  return (
    <div className="flex gap-3 items-start">
      <Avatar />
      <div className="bg-slate-800 text-slate-100 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[85%] min-w-0">
        <ChatMarkdown>{text}</ChatMarkdown>
      </div>
    </div>
  )
}

function Avatar() {
  return <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5">M</div>
}

function Working() {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="flex gap-3 items-center slide-up">
      <Avatar />
      <div className="flex gap-1 items-center">
        <span className="w-2 h-2 rounded-full bg-blue-500 pulse-1" />
        <span className="w-2 h-2 rounded-full bg-blue-500 pulse-2" />
        <span className="w-2 h-2 rounded-full bg-blue-500 pulse-3" />
      </div>
      {elapsed >= 5 && (
        <span className="text-xs text-slate-500 font-mono tabular-nums">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
        </span>
      )}
    </div>
  )
}
