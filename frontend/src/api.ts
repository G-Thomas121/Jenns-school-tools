import type { Conversation, Suggestion } from './types'

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? 'Request failed')
  }
  return res.json()
}

const body = (data: unknown) => ({ body: JSON.stringify(data) })

// ── Chat ───────────────────────────────────────────────────────────────────────
export const getConversations = () => req<Conversation[]>('/api/chat/conversations')
export const createConversation = () => req<Conversation>('/api/chat/conversations', { method: 'POST' })
export const deleteConversation = (id: number) => req<{ ok: boolean }>(`/api/chat/conversations/${id}`, { method: 'DELETE' })
export const streamUrl = (convId: number, since = 0) => `/api/chat/conversations/${convId}/stream?since=${since}`
export const sendMessage = (convId: number, content: string) =>
  req<{ ok: boolean }>(`/api/chat/conversations/${convId}/messages`, { method: 'POST', ...body({ content }) })
export const stopConversation = (convId: number) =>
  req<{ ok: boolean }>(`/api/chat/conversations/${convId}/stop`, { method: 'POST' })

// ── Workspace files ────────────────────────────────────────────────────────────
export const getFiles = () => req<string[]>('/api/files')
export const getFile = (path: string) =>
  req<{ path: string; content: string }>(`/api/files/content?path=${encodeURIComponent(path)}`)
export const saveFile = (path: string, content: string) =>
  req<{ path: string; content: string }>('/api/files/content', { method: 'PUT', ...body({ path, content }) })

export interface UploadResult { saved: string[]; skipped: string[]; flagged: string[]; indexes: string[] }

// One file or a whole folder. Files picked from a folder carry their path inside it, which
// the browser leaves out of the filename, so it's sent alongside.
export const uploadFiles = async (files: File[], lesson?: string): Promise<UploadResult> => {
  const form = new FormData()
  for (const f of files) {
    form.append('files', f)
    form.append('paths', f.webkitRelativePath || f.name)
  }
  if (lesson) form.append('lesson', lesson)
  const res = await fetch('/api/files/upload', { method: 'POST', body: form })
  if (!res.ok) throw new Error((await res.json()).detail ?? 'Upload failed')
  return res.json()
}

export const describeUpload = ({ saved, skipped, flagged }: UploadResult) =>
  [
    saved.length === 1 ? `Added ${saved[0]}` : `Added ${saved.length} files`,
    skipped.length ? `skipped ${skipped.length} unsupported` : '',
    flagged.length ? `${flagged.length} look scanned (little text)` : '',
  ].filter(Boolean).join(' · ')

// ── Suggestions ────────────────────────────────────────────────────────────────
export const getSuggestions = () => req<Suggestion[]>('/api/suggestions')
export const createSuggestion = (data: { title: string; description: string }) => req<Suggestion>('/api/suggestions', { method: 'POST', ...body(data) })
export const updateSuggestion = (id: number, status: string) => req<Suggestion>(`/api/suggestions/${id}`, { method: 'PUT', ...body({ status }) })
export const deleteSuggestion = (id: number) => req<{ ok: boolean }>(`/api/suggestions/${id}`, { method: 'DELETE' })
