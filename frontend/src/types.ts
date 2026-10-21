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

export interface Suggestion {
  id: number
  title: string
  description: string
  status: 'new' | 'reviewed' | 'planned' | 'done'
  created_at: string
}
