import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { createConversation, updateConversation, sendMessage } from '../api'
import type { Workflow } from '../types'

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
