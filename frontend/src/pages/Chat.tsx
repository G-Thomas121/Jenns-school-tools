import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, Plus, Trash2, Paperclip, FileText, Key, Monitor, Download, Presentation } from 'lucide-react'
import {
  getConversations, createConversation, deleteConversation,
  getMessages, sendMessage, uploadDoc, downloadUrl, pptxUrl,
} from '../api'
import OutputModal from '../components/OutputModal'
import PromptChips from '../components/PromptChips'
import type { Message, OutputVariant } from '../types'

interface ModalState { workflowId: number; outputId: number; variant: OutputVariant; title: string }

export default function Chat() {
  const { convId: convIdParam } = useParams()
  const convId = convIdParam ? parseInt(convIdParam) : null
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastId, setLastId] = useState(0)
  const [allMessages, setAllMessages] = useState<Message[]>([])
  const [modal, setModal] = useState<ModalState | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations'],
    queryFn: getConversations,
    refetchInterval: 15_000,
  })

  // Poll for new messages
  useQuery({
    queryKey: ['messages', convId, lastId],
    queryFn: async () => {
      if (!convId) return []
      const msgs = await getMessages(convId, lastId)
      if (msgs.length > 0) {
        setAllMessages(prev => [...prev, ...msgs])
        setLastId(msgs[msgs.length - 1].id)
        const lastRole = msgs[msgs.length - 1].display_role
        if (lastRole === 'assistant' || lastRole === 'error') {
          setIsProcessing(false)
        }
      }
      return msgs
    },
    enabled: !!convId,
    refetchInterval: isProcessing ? 2000 : 5000,
  })

  // Reset when conversation changes
  useEffect(() => {
    setAllMessages([])
    setLastId(0)
    setIsProcessing(false)
  }, [convId])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [allMessages, isProcessing])

  const newConv = useMutation({
    mutationFn: createConversation,
    onSuccess: (conv) => {
      qc.invalidateQueries({ queryKey: ['conversations'] })
      navigate(`/chat/${conv.id}`)
    },
  })

  const deleteConv = useMutation({
    mutationFn: (id: number) => deleteConversation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] })
      navigate('/chat')
    },
  })

  const send = useMutation({
    mutationFn: (content: string) => sendMessage(convId!, content),
    onSuccess: () => {
      setIsProcessing(true)
    },
  })

  const upload = useMutation({
    mutationFn: (file: File) => uploadDoc(file),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['docs'] })
      // Inject a system message into the chat
      setAllMessages(prev => [...prev, {
        id: Date.now(),
        conversation_id: convId ?? 0,
        display_role: 'system',
        display_content: `📎 ${data.message}`,
        tool_name: null,
        created_at: new Date().toISOString(),
      }])
    },
  })

  const handleSend = useCallback(() => {
    const content = input.trim()
    if (!content || !convId || isProcessing) return
    setInput('')
    // Optimistically add user message
    setAllMessages(prev => [...prev, {
      id: Date.now(),
      conversation_id: convId,
      display_role: 'user',
      display_content: content,
      tool_name: null,
      created_at: new Date().toISOString(),
    }])
    send.mutate(content)
  }, [input, convId, isProcessing, send])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-screen">
      {/* Conv list sidebar */}
      <div className="w-52 flex-shrink-0 bg-slate-950 border-r border-slate-800 flex flex-col">
        <div className="p-3">
          <button onClick={() => newConv.mutate()} className="btn w-full justify-center text-xs gap-1.5">
            <Plus size={13} /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {conversations.map(c => (
            <div
              key={c.id}
              className={`group flex items-center gap-1.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                c.id === convId ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
              onClick={() => navigate(`/chat/${c.id}`)}
            >
              <span className="text-xs truncate flex-1">{c.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); if (confirm('Delete?')) deleteConv.mutate(c.id) }}
                className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all flex-shrink-0"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-slate-800">
          <label className="btn btn-outline w-full justify-center text-xs cursor-pointer">
            <Paperclip size={12} /> Upload Doc
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { upload.mutate(f); e.target.value = '' } }}
            />
          </label>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-slate-950">
        {!convId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-500">
            <div className="w-16 h-16 rounded-full bg-blue-600/20 flex items-center justify-center text-2xl font-bold text-blue-400">M</div>
            <div className="text-center">
              <p className="text-lg font-semibold text-slate-300">Hi, I'm MARTY</p>
              <p className="text-sm mt-1">Start a new chat to create worksheets, lesson plans, and more.</p>
            </div>
            <button onClick={() => newConv.mutate()} className="btn btn-lg mt-2">
              <Plus size={16} /> New Chat
            </button>
          </div>
        ) : (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto flex flex-col">
              {allMessages.length === 0 && !isProcessing ? (
                <PromptChips
                  onPrompt={(prompt) => {
                    setInput(prompt)
                    inputRef.current?.focus()
                  }}
                />
              ) : (
                <div className="px-6 py-6 space-y-3">
                  {allMessages.map((msg) => (
                    <MessageBubble key={msg.id} msg={msg} onOpenOutput={(wfId, outId, variant, title) =>
                      setModal({ workflowId: wfId, outputId: outId, variant, title })}
                    />
                  ))}
                  {isProcessing && <TypingIndicator />}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input */}
            <div className="px-6 py-4 border-t border-slate-800">
              <div className="flex gap-3 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  disabled={isProcessing}
                  placeholder="Ask MARTY to create a worksheet, lesson plan, revise something…"
                  className="flex-1 input resize-none"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isProcessing}
                  className="btn h-[72px] px-5"
                >
                  <Send size={16} />
                </button>
              </div>
              <p className="text-xs text-slate-600 mt-2">Enter to send · Shift+Enter for new line</p>
            </div>
          </>
        )}
      </div>

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

function MessageBubble({ msg, onOpenOutput }: {
  msg: Message
  onOpenOutput: (wfId: number, outId: number, variant: OutputVariant, title: string) => void
}) {
  const outputIds = [...new Set([...msg.display_content.matchAll(/output_id=(\d+)/g)].map(m => parseInt(m[1])))]

  if (msg.display_role === 'user') {
    return (
      <div className="flex justify-end slide-up">
        <div className="bg-blue-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[75%] text-sm whitespace-pre-wrap">
          {msg.display_content}
        </div>
      </div>
    )
  }

  if (msg.display_role === 'assistant') {
    return (
      <div className="flex gap-3 items-start slide-up">
        <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5">M</div>
        <div className="max-w-[80%]">
          <div
            className="bg-slate-800 text-slate-100 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.display_content) }}
          />
          {outputIds.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {outputIds.map(id => (
                <OutputActionButtons key={id} outputId={id} onOpen={onOpenOutput} />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (msg.display_role === 'tool_call') {
    return (
      <div className="flex items-center gap-2 pl-10 slide-up">
        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
        <span className="text-xs text-slate-500 font-mono">
          MARTY called: <span className="text-blue-400">{msg.display_content}</span>
        </span>
      </div>
    )
  }

  if (msg.display_role === 'tool_result') {
    return (
      <div className="pl-14 slide-up">
        <span className="text-xs text-slate-600">↳ {msg.display_content}</span>
      </div>
    )
  }

  if (msg.display_role === 'error') {
    return (
      <div className="ml-10 bg-red-950 border border-red-800 rounded-xl px-4 py-2.5 text-red-300 text-sm slide-up">
        {msg.display_content}
      </div>
    )
  }

  if (msg.display_role === 'system') {
    return (
      <div className="text-center text-xs text-slate-500 py-1 slide-up">{msg.display_content}</div>
    )
  }

  return null
}

function OutputActionButtons({ outputId, onOpen }: {
  outputId: number
  onOpen: (wfId: number, outId: number, variant: OutputVariant, title: string) => void
}) {
  const VARIANTS: { key: OutputVariant; icon: React.ElementType; label: string }[] = [
    { key: 'student', icon: FileText, label: 'Student' },
    { key: 'teacher', icon: Key, label: 'Teacher Key' },
    { key: 'slideshow', icon: Monitor, label: 'Slideshow' },
  ]

  return (
    <>
      {VARIANTS.map(v => (
        <button
          key={v.key}
          onClick={() => onOpen(0, outputId, v.key, `Output ${outputId} — ${v.label}`)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs text-slate-300 transition-colors"
        >
          <v.icon size={11} /> {v.label}
        </button>
      ))}
      <a href={pptxUrl(outputId)} download className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-900/40 hover:bg-blue-800/40 text-xs text-blue-300 transition-colors">
        <Presentation size={11} /> PPTX
      </a>
      <a href={downloadUrl(outputId, 'student')} download className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs text-slate-300 transition-colors">
        <Download size={11} /> HTML
      </a>
    </>
  )
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 items-start slide-up">
      <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">M</div>
      <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1 items-center">
        <span className="w-2 h-2 rounded-full bg-blue-500 pulse-1" />
        <span className="w-2 h-2 rounded-full bg-blue-500 pulse-2" />
        <span className="w-2 h-2 rounded-full bg-blue-500 pulse-3" />
      </div>
    </div>
  )
}

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code class="bg-slate-900 px-1 py-0.5 rounded text-blue-300 text-xs">$1</code>')
    .replace(/\n/g, '<br>')
}
