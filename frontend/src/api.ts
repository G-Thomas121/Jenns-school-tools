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

export const uploadFile = async (file: File): Promise<{ path: string }> => {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/files/upload', { method: 'POST', body: form })
  if (!res.ok) throw new Error((await res.json()).detail ?? 'Upload failed')
  return res.json()
}

// ── Suggestions ────────────────────────────────────────────────────────────────
export const getSuggestions = () => req<Suggestion[]>('/api/suggestions')
export const createSuggestion = (data: { title: string; description: string }) => req<Suggestion>('/api/suggestions', { method: 'POST', ...body(data) })
export const updateSuggestion = (id: number, status: string) => req<Suggestion>(`/api/suggestions/${id}`, { method: 'PUT', ...body({ status }) })
export const deleteSuggestion = (id: number) => req<{ ok: boolean }>(`/api/suggestions/${id}`, { method: 'DELETE' })
