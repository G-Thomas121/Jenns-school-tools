export type MessageRole = 'user' | 'assistant' | 'tool' | 'error'

export interface Conversation {
  id: number
  title: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: number
  display_role: MessageRole
  display_content: string
  path: string | null
  created_at: string
}

/** A file MARTY is writing right now. content is null for edits (only the target is known). */
export interface Draft {
  path: string
  content: string | null
}

/** Events from GET /api/chat/conversations/:id/stream (see app/services/events.py). */
export type StreamEvent =
  | { type: 'message'; message: Message }
  | { type: 'delta'; text: string }
  | { type: 'draft'; path: string; content: string | null }
  | { type: 'status'; running: boolean }
  | { type: 'reset' }
  | { type: 'done' }

export interface Suggestion {
  id: number
  title: string
  description: string
  status: 'new' | 'reviewed' | 'planned' | 'done'
  created_at: string
}
