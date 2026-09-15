import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { createConversation, updateConversation, sendMessage } from '../api'
import type { Workflow, LessonTopic, TopicWorkflow } from '../types'

export function useRevisionChat() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  return async (wf: Workflow, outputId?: number | null) => {
    const conv = await createConversation()
    await updateConversation(conv.id, { title: `Revising: ${wf.name}` })
    qc.invalidateQueries({ queryKey: ['conversations'] })

    const hiddenPrompt = `[REVISION CONTEXT — do not repeat this back verbatim]
Jenn wants to revise an existing material: "${wf.name}"
Type: ${wf.type}, Class: ${wf.grade}
${outputId ? `Most recent output_id: ${outputId}` : ''}
Original description: ${wf.context ?? '(no description)'}

Greet Jenn briefly and ask what she'd like to change. Once she describes it, use the revise_output tool${outputId ? ` with output_id=${outputId}` : ''}. Do not generate anything yet — just ask what to change.`

    await sendMessage(conv.id, hiddenPrompt, true)
    navigate(`/chat/${conv.id}`)
  }
}

export function useTopicChat() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  return async (topic: LessonTopic) => {
    const conv = await createConversation()
    await updateConversation(conv.id, { title: topic.name })
    qc.invalidateQueries({ queryKey: ['conversations'] })

    const TYPE_LABELS: Record<string, string> = {
      lesson_plan: 'Lesson Plan', slideshow: 'Slideshow', worksheet: 'Worksheet',
      foldable: 'Foldable', bell_ringer: 'Bell Ringer', exit_ticket: 'Exit Ticket',
      study_guide: 'Study Guide', custom: 'Custom',
    }

    const materialsDesc = topic.workflows.length
      ? topic.workflows.map(w =>
          `- ${TYPE_LABELS[w.type] ?? w.type}: "${w.name}"${w.latest_output_id ? ` (output_id=${w.latest_output_id})` : ''}`
        ).join('\n')
      : '(none yet)'

    const missingTypes = (['lesson_plan', 'slideshow', 'worksheet', 'foldable', 'bell_ringer', 'exit_ticket'] as const)
      .filter(t => !topic.workflows.some(w => w.type === t))

    const hiddenPrompt = `[LESSON TOPIC CONTEXT — do not repeat this back verbatim]
Lesson topic: "${topic.name}"
Class: ${topic.grade}
topic_id: ${topic.id}

Materials already created for this lesson:
${materialsDesc}

${missingTypes.length ? `Not yet created: ${missingTypes.map(t => TYPE_LABELS[t]).join(', ')}` : 'All standard materials have been created.'}

Greet Jenn briefly, summarize what exists for this lesson in one sentence, and ask what she'd like to do — revise something, add a missing material type, or something else.

When creating NEW materials for this topic, use topic_id=${topic.id}.
When revising, use revise_output with the appropriate output_id listed above.`

    await sendMessage(conv.id, hiddenPrompt, true)
    navigate(`/chat/${conv.id}`)
  }
}
