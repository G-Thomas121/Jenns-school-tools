import type {
  Workflow, Output, OutputSummary, CurriculumDoc, ContextNote,
  Student, Suggestion, Conversation, Message, Job, GradebookSummary, Grade,
} from './types'

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

// ── Workflows ──────────────────────────────────────────────────────────────────
export const getWorkflows = () => req<Workflow[]>('/api/workflows')
export const getWorkflow = (id: number) => req<Workflow & { outputs: OutputSummary[] }>(`/api/workflows/${id}`)
export const createWorkflow = (data: Partial<Workflow>) => req<Workflow>('/api/workflows', { method: 'POST', ...body(data) })
export const updateWorkflow = (id: number, data: Partial<Workflow>) => req<Workflow>(`/api/workflows/${id}`, { method: 'PUT', ...body(data) })
export const deleteWorkflow = (id: number) => req<{ ok: boolean }>(`/api/workflows/${id}`, { method: 'DELETE' })
export const getOutput = (workflowId: number, outputId: number) => req<Output>(`/api/workflows/${workflowId}/outputs/${outputId}`)
export const deleteOutput = (workflowId: number, outputId: number) => req<{ ok: boolean }>(`/api/workflows/${workflowId}/outputs/${outputId}`, { method: 'DELETE' })

// ── Generate ───────────────────────────────────────────────────────────────────
export interface GenerateRequest {
  workflow_id: number
  notes?: string | null
  base_output_id?: number | null
  revision_instructions?: string | null
  variants?: string[]
}
export const startGenerate = (data: GenerateRequest) => req<{ job_id: string }>('/api/generate', { method: 'POST', ...body(data) })
export const getJob = (jobId: string) => req<Job>(`/api/generate/jobs/${jobId}`)

// ── Documents ──────────────────────────────────────────────────────────────────
export const getDocs = () => req<CurriculumDoc[]>('/api/documents')
export const scanDocs = () => req<{ added: string[]; documents: CurriculumDoc[] }>('/api/documents/scan', { method: 'POST' })
export const updateDoc = (id: number, data: Partial<CurriculumDoc>) => req<CurriculumDoc>(`/api/documents/${id}`, { method: 'PUT', ...body(data) })
export const deleteDoc = (id: number) => req<{ ok: boolean }>(`/api/documents/${id}`, { method: 'DELETE' })

// ── Context ────────────────────────────────────────────────────────────────────
export const getContextNotes = () => req<ContextNote[]>('/api/context')
export const createContextNote = (data: Partial<ContextNote>) => req<ContextNote>('/api/context', { method: 'POST', ...body(data) })
export const updateContextNote = (id: number, data: Partial<ContextNote>) => req<ContextNote>(`/api/context/${id}`, { method: 'PUT', ...body(data) })
export const deleteContextNote = (id: number) => req<{ ok: boolean }>(`/api/context/${id}`, { method: 'DELETE' })

// ── Students ───────────────────────────────────────────────────────────────────
export const getStudents = () => req<Student[]>('/api/students')
export const createStudent = (data: { name: string; grade: Grade }) => req<Student>('/api/students', { method: 'POST', ...body(data) })
export const updateStudent = (id: number, data: Partial<Student>) => req<Student>(`/api/students/${id}`, { method: 'PUT', ...body(data) })
export const deleteStudent = (id: number) => req<{ ok: boolean }>(`/api/students/${id}`, { method: 'DELETE' })

// ── Suggestions ────────────────────────────────────────────────────────────────
export const getSuggestions = () => req<Suggestion[]>('/api/suggestions')
export const createSuggestion = (data: { title: string; description: string }) => req<Suggestion>('/api/suggestions', { method: 'POST', ...body(data) })
export const updateSuggestion = (id: number, status: string) => req<Suggestion>(`/api/suggestions/${id}`, { method: 'PUT', ...body({ status }) })
export const deleteSuggestion = (id: number) => req<{ ok: boolean }>(`/api/suggestions/${id}`, { method: 'DELETE' })

// ── Gradebook ──────────────────────────────────────────────────────────────────
export const getGradebookSummary = (grade?: string) =>
  req<GradebookSummary[]>(`/api/gradebook/summary${grade ? `?grade=${grade}` : ''}`)

// ── Chat / MARTY ───────────────────────────────────────────────────────────────
export const getConversations = () => req<Conversation[]>('/api/chat/conversations')
export const createConversation = () => req<Conversation>('/api/chat/conversations', { method: 'POST' })
export const deleteConversation = (id: number) => req<{ ok: boolean }>(`/api/chat/conversations/${id}`, { method: 'DELETE' })
export const getMessages = (convId: number, since = 0) =>
  req<Message[]>(`/api/chat/conversations/${convId}/messages?since=${since}`)
export const sendMessage = (convId: number, content: string) =>
  req<{ ok: boolean }>(`/api/chat/conversations/${convId}/messages`, { method: 'POST', ...body({ content }) })

export const uploadDoc = async (file: File): Promise<{ message: string; filename: string; doc_id?: number }> => {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/chat/upload', { method: 'POST', body: form })
  if (!res.ok) throw new Error((await res.json()).detail ?? 'Upload failed')
  return res.json()
}

export const downloadUrl = (outputId: number, variant: string) =>
  `/api/chat/outputs/${outputId}/download/${variant}`
export const pptxUrl = (outputId: number) =>
  `/api/chat/outputs/${outputId}/export/pptx`
