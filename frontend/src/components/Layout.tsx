import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lightbulb, MessageSquare, Paperclip, Plus, Trash2 } from 'lucide-react'
import { deleteConversation, getConversations, uploadFile } from '../api'

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: conversations = [] } = useQuery({ queryKey: ['conversations'], queryFn: getConversations })
  const [uploadStatus, setUploadStatus] = useState<{ msg: string; ok: boolean } | null>(null)

  const remove = useMutation({
    mutationFn: deleteConversation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] })
      navigate('/chat')
    },
  })

  const upload = useMutation({
    mutationFn: uploadFile,
    onSuccess: ({ path }) => {
      qc.invalidateQueries({ queryKey: ['files'] })
      setUploadStatus({ msg: `Added ${path}`, ok: true })
      setTimeout(() => setUploadStatus(null), 4000)
    },
    onError: (e: Error) => {
      setUploadStatus({ msg: `Upload failed: ${e.message}`, ok: false })
      setTimeout(() => setUploadStatus(null), 6000)
    },
  })

  return (
    <div className="flex h-screen overflow-hidden">
      <nav className="w-56 flex-shrink-0 bg-slate-950 border-r border-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <div className="font-bold text-white text-base tracking-wide">MARTY</div>
          <div className="text-xs text-slate-500 mt-0.5">Jenn's Teaching Assistant</div>
        </div>

        <div className="p-2">
          <button onClick={() => navigate('/chat')} className="btn btn-outline w-full justify-center text-xs">
            <Plus size={13} /> New chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {conversations.map(c => <ConversationLink key={c.id} id={c.id} title={c.title} onDelete={() => remove.mutate(c.id)} />)}
        </div>

        <div className="p-2 border-t border-slate-800 space-y-1">
          {uploadStatus && (
            <div className={`text-xs px-2.5 py-1.5 rounded-md text-center break-words ${
              uploadStatus.ok ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
              {uploadStatus.msg}
            </div>
          )}
          <label className={`btn btn-ghost btn-sm w-full cursor-pointer ${upload.isPending ? 'opacity-60' : ''}`}>
            <Paperclip size={13} /> {upload.isPending ? 'Uploading…' : 'Upload curriculum'}
            <input
              type="file" accept=".pdf,.docx,.txt,.md" className="hidden" disabled={upload.isPending}
              onChange={e => { const f = e.target.files?.[0]; if (f) { upload.mutate(f); e.target.value = '' } }}
            />
          </label>
          <NavLink to="/suggestions" className={({ isActive }) =>
            `btn btn-ghost btn-sm w-full ${isActive ? 'text-blue-400' : ''}`}>
            <Lightbulb size={13} /> Suggestions
          </NavLink>
        </div>
      </nav>

      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}

function ConversationLink({ id, title, onDelete }: { id: number; title: string; onDelete: () => void }) {
  return (
    <NavLink
      to={`/chat/${id}`}
      className={({ isActive }) => `group flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors ${
        isActive ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'}`}
    >
      <MessageSquare size={12} className="flex-shrink-0 opacity-50" />
      <span className="truncate flex-1">{title}</span>
      <button
        onClick={e => { e.preventDefault(); if (confirm('Delete this chat? Files MARTY made stay in the workspace.')) onDelete() }}
        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400"
      >
        <Trash2 size={11} />
      </button>
    </NavLink>
  )
}
