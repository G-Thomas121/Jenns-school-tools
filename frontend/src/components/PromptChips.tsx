import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getDocs } from '../api'

export interface ChipSubmission {
  hiddenPrompt: string
  title: string
}

interface Props {
  onSubmit: (submission: ChipSubmission) => void
}

const CLASS_OPTIONS = [
  { label: 'English 1', sub: '9th grade', value: 'english1', prompt: 'English 1 (9th grade)' },
  { label: 'English 2', sub: '10th grade', value: 'english2', prompt: 'English 2 (10th grade)' },
  { label: 'Both', sub: 'E1 & E2', value: 'both', prompt: 'both English 1 and English 2' },
]

const EXTRA_CHIPS = [
  { label: 'Bell ringer', value: 'bell_ringer', emoji: '🔔' },
  { label: 'Worksheet', value: 'worksheet', emoji: '📝' },
  { label: 'Foldable', value: 'foldable', emoji: '📂' },
  { label: 'Exit ticket', value: 'exit_ticket', emoji: '🎟' },
]

const EXTRA_LABELS: Record<string, string> = {
  bell_ringer: 'bell ringer',
  worksheet: 'worksheet',
  foldable: 'foldable',
  exit_ticket: 'exit ticket',
}

export default function PromptChips({ onSubmit }: Props) {
  const [topic, setTopic] = useState('')
  const [classVal, setClassVal] = useState('')
  const [extras, setExtras] = useState<string[]>([])
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>([])

  const { data: docs = [] } = useQuery({ queryKey: ['docs'], queryFn: getDocs })

  const toggleExtra = (v: string) =>
    setExtras(prev => prev.includes(v) ? prev.filter(e => e !== v) : [...prev, v])

  const toggleDoc = (id: number) =>
    setSelectedDocIds(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id])

  const canSubmit = topic.trim().length > 0 && classVal !== ''

  const handleSubmit = () => {
    if (!canSubmit) return

    const classPrompt = CLASS_OPTIONS.find(c => c.value === classVal)?.prompt ?? classVal
    const classShort = CLASS_OPTIONS.find(c => c.value === classVal)?.label ?? classVal

    const selectedDocTitles = docs
      .filter(d => selectedDocIds.includes(d.id))
      .map(d => d.title ?? d.filename)
    const docSection = selectedDocTitles.length
      ? `\nReference documents: ${selectedDocTitles.join(', ')}`
      : ''

    const extraSection = extras.length
      ? `\nAlso create: ${extras.map(e => EXTRA_LABELS[e]).join(', ')}`
      : ''

    const title = `${topic.slice(0, 50)} — ${classShort}`

    const hiddenPrompt =
      `[CONTEXT FROM JENN — do not repeat this back verbatim]
Today's class: ${classPrompt}
Topic / unit: ${topic}${extraSection}${docSection}

Build a complete lesson day package for Jenn:
1. Lesson plan (with timing for a typical class period)
2. Companion slideshow aligned to the lesson plan
${extras.length ? `3. ${extras.map(e => EXTRA_LABELS[e]).join(', ')} — create these after the lesson plan and slideshow` : ''}

Ask Jenn one brief clarifying question if you need it (e.g. specific text, class duration, particular standards to hit) — keep it short. Then proceed to build. After the main materials are done, ask if she needs anything else.`

    onSubmit({ hiddenPrompt, title })
  }

  return (
    <div className="flex flex-col items-center justify-start flex-1 px-8 py-10 overflow-y-auto">
      <div className="w-14 h-14 rounded-full bg-blue-700 flex items-center justify-center text-xl font-bold text-white mb-5 shadow-lg shadow-blue-900/40 flex-shrink-0">
        M
      </div>

      <h1 className="text-lg font-semibold text-slate-100 mb-1 text-center">What are we teaching today?</h1>
      <p className="text-sm text-slate-500 mb-7 text-center">MARTY will build a lesson plan + slideshow, plus anything else you need.</p>

      <div className="w-full max-w-md space-y-6">

        {/* Topic input */}
        <div>
          <label className="label">Topic / unit / text</label>
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (canSubmit) handleSubmit() } }}
            rows={2}
            placeholder="e.g. The Most Dangerous Game — character motivation"
            className="input resize-none"
            autoFocus
          />
        </div>

        {/* Class selector */}
        <div>
          <label className="label">Which class?</label>
          <div className="flex gap-2">
            {CLASS_OPTIONS.map(c => (
              <button
                key={c.value}
                onClick={() => setClassVal(c.value)}
                className={`flex-1 flex flex-col items-center py-2.5 rounded-xl border text-sm transition-all ${
                  classVal === c.value
                    ? 'bg-blue-600/25 border-blue-500 text-blue-300'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
                }`}
              >
                <span className="font-medium">{c.label}</span>
                <span className="text-xs text-slate-500 mt-0.5">{c.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Extra materials */}
        <div>
          <label className="label">Also need today? <span className="text-slate-600 font-normal">(optional)</span></label>
          <div className="flex flex-wrap gap-2">
            {EXTRA_CHIPS.map(c => {
              const active = extras.includes(c.value)
              return (
                <button
                  key={c.value}
                  onClick={() => toggleExtra(c.value)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-sm transition-all ${
                    active
                      ? 'bg-blue-600/25 border-blue-500 text-blue-300'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <span>{c.emoji}</span> {c.label}
                  {active && <span className="ml-1 text-blue-400 text-xs">✓</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Docs */}
        {docs.length > 0 && (
          <div>
            <label className="label">Reference docs? <span className="text-slate-600 font-normal">(optional)</span></label>
            <div className="space-y-1.5">
              {docs.map(d => (
                <label key={d.id} className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 hover:border-slate-600 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedDocIds.includes(d.id)}
                    onChange={() => toggleDoc(d.id)}
                    className="accent-blue-500 flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-slate-200 font-medium truncate">{d.title ?? d.filename}</p>
                    {d.subject && <p className="text-xs text-slate-500">{d.subject}</p>}
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="btn w-full justify-center gap-2 py-3 text-base"
        >
          Let's build it <ArrowRight size={16} />
        </button>

      </div>

      <p className="text-xs text-slate-700 mt-6">or just type below</p>
    </div>
  )
}
