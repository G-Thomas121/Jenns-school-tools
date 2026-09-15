export type Grade = 'english1' | 'english2' | 'both'
export type WorkflowType = 'worksheet' | 'foldable' | 'slideshow' | 'study_guide' | 'lesson_plan' | 'bell_ringer' | 'exit_ticket' | 'custom'
export type OutputVariant = 'student' | 'teacher' | 'slideshow'

export interface LessonTopic {
  id: number
  name: string
  grade: Grade
  created_at: string
  updated_at: string
  workflows: TopicWorkflow[]
}

export interface TopicWorkflow {
  id: number
  name: string
  type: WorkflowType
  grade: Grade
  updated_at: string
  latest_output_id: number | null
  output_count: number
}
export type MessageRole = 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'error' | 'system'

export interface Workflow {
  id: number
  name: string
  type: WorkflowType
  grade: Grade
  context: string | null
  instructions: string | null
  doc_ids: string
  rubric: string | null
  topic_id: number | null
  created_at: string
  updated_at: string
  output_count?: number
  outputs?: OutputSummary[]
}

export interface OutputSummary {
  id: number
  version: number
  notes: string | null
  created_at: string
}

export interface Output {
  id: number
  workflow_id: number
  version: number
  html: string
  teacher_html: string | null
  slideshow_html: string | null
  slideshow_json: string | null
  status: 'generating' | 'complete'
  notes: string | null
  created_at: string
}

export interface CurriculumDoc {
  id: number
  filename: string
  filepath: string
  title: string | null
  subject: string | null
  grade: string | null
  tags: string
  description: string | null
  added_at: string
}

export interface ContextNote {
  id: number
  title: string
  content: string
  category: string
  active: number
  created_at: string
  updated_at: string
}

export interface Student {
  id: number
  name: string
  grade: Grade
  active: number
  created_at: string
}

export interface Suggestion {
  id: number
  title: string
  description: string
  status: 'new' | 'reviewed' | 'planned' | 'done'
  created_at: string
}

export interface Conversation {
  id: number
  title: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: number
  conversation_id: number
  display_role: MessageRole
  display_content: string
  tool_name: string | null
  created_at: string
}

export interface Job {
  id: string
  workflow_id: number
  output_id: number | null
  status: 'pending' | 'running' | 'complete' | 'error'
  progress: string
  error: string | null
}

export interface GradebookSummary {
  id: number
  name: string
  grade: string
  graded_count: number
  avg_pct: number | null
}
