import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getDocs } from '../api'

const STEP_TYPE = 0
const STEP_CLASS = 1
const STEP_FOCUS = 2
const STEP_VARIANTS = 3
const STEP_DOCS = 4
const TOTAL_STEPS = 5

const TYPE_CHIPS = [
  { label: 'Worksheet', value: 'a worksheet', emoji: '📝' },
  { label: 'Foldable', value: 'a foldable', emoji: '📂' },
  { label: 'Slideshow', value: 'a slideshow', emoji: '🖥' },
  { label: 'Lesson Plan', value: 'a lesson plan', emoji: '📋' },
  { label: 'Study Guide', value: 'a study guide', emoji: '📚' },
]

const CLASS_CHIPS = [
  { label: 'English 1 — 9th grade', value: 'for English 1 (9th grade)' },
  { label: 'English 2 — 10th grade', value: 'for English 2 (10th grade)' },
  { label: 'Both classes', value: 'for both English 1 and English 2' },
]

const FOCUS_CHIPS = [
  { label: 'Textual evidence', value: 'citing textual evidence' },
  { label: 'Vocabulary', value: 'vocabulary' },
  { label: 'Reading comprehension', value: 'reading comprehension' },
  { label: 'Character analysis', value: 'character analysis' },
  { label: 'Theme & symbolism', value: 'theme and symbolism' },
  { label: 'Writing practice', value: 'a writing activity' },
  { label: 'Grammar & conventions', value: 'grammar and conventions' },
  { label: 'Plot & structure', value: 'plot and narrative structure' },
]

const VARIANT_CHIPS = [
  {
    label: 'Student copy only',
    value: ['student'],
    description: 'Worksheet students receive',
  },
  {
    label: 'Student + Teacher answer key',
    value: ['student', 'teacher'],
    description: 'Student copy with a completed key',
  },
  {
    label: 'Just the slideshow',
    value: ['slideshow'],
    description: 'Presentation slides only',
  },
  {
    label: 'Full set',
    value: ['student', 'teacher', 'slideshow'],
    description: 'Student copy, answer key, and slideshow',
  },
]

export interface ChipSubmission {
  hiddenPrompt: string
  title: string
}

interface Props {
  onSubmit: (submission: ChipSubmission) => void
}

export default function PromptChips({ onSubmit }: Props) {
  const [step, setStep] = useState(STEP_TYPE)
  const [typeVal, setTypeVal] = useState('')
  const [classVal, setClassVal] = useState('')
  const [focusVals, setFocusVals] = useState<string[]>([])
  const [variants, setVariants] = useState<string[]>(['student', 'teacher', 'slideshow'])
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>([])

  const { data: docs = [] } = useQuery({ queryKey: ['docs'], queryFn: getDocs })

  const toggleFocus = (v: string) =>
    setFocusVals(prev => prev.includes(v) ? prev.filter(f => f !== v) : [...prev, v])

  const toggleDoc = (id: number) =>
    setSelectedDocIds(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id])

  const back = () => setStep(s => s - 1)

  const handleSubmit = () => {
    const focusText = focusVals.length
      ? `focused on ${focusVals.join(', ')}`
      : ''
    const variantLabel = variants.length === 3 ? 'student copy, teacher answer key, and slideshow'
      : variants.includes('teacher') ? 'student copy and teacher answer key'
      : 'student copy'

    const selectedDocTitles = docs
      .filter(d => selectedDocIds.includes(d.id))
      .map(d => d.title ?? d.filename)
    const docSection = selectedDocTitles.length
      ? `\nCurriculum documents to reference: ${selectedDocTitles.join(', ')}`
      : ''

    const shortTitle = [
      typeVal.replace('a ', '').replace('an ', ''),
      classVal.replace('for ', ''),
      focusVals[0] ?? '',
    ].filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' · ')

    const hiddenPrompt =
      `[CONTEXT FROM JENN — do not repeat this back verbatim]
Jenn wants to create: ${typeVal} ${classVal}${focusText ? ' ' + focusText : ''}.
Output needed: ${variantLabel}.${docSection}

Before generating any materials, ask Jenn 1–2 short clarifying questions — for example: which specific text they're using, desired length, anything specific to include or avoid. Keep it brief and conversational. Do not generate documents yet.`

    onSubmit({ hiddenPrompt, title: shortTitle })
  }

  const progressDots = Array.from({ length: TOTAL_STEPS }, (_, i) => (
    <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${
      i < step ? 'w-6 bg-blue-500' : i === step ? 'w-6 bg-blue-400' : 'w-1.5 bg-slate-700'
    }`} />
  ))

  const Chip = ({ label, emoji, active, onClick }: { label: string; emoji?: string; active?: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-sm transition-all duration-150 active:scale-95 ${
        active
          ? 'bg-blue-600/30 border-blue-500 text-blue-300 font-medium'
          : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:border-blue-500/50 hover:text-white'
      }`}
    >
      {active && <Check size={12} className="text-blue-400" />}
      {emoji && !active && <span>{emoji}</span>}
      {label}
    </button>
  )

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-8 py-10">
      <div className="w-14 h-14 rounded-full bg-blue-700 flex items-center justify-center text-xl font-bold text-white mb-6 shadow-lg shadow-blue-900/40">
        M
      </div>

      <div className="flex gap-1.5 mb-6">{progressDots}</div>

      {/* Breadcrumb */}
      {(typeVal || classVal || focusVals.length > 0) && (
        <div className="flex items-center gap-1.5 mb-5 flex-wrap justify-center max-w-md">
          {[typeVal, classVal, ...focusVals].filter(Boolean).map((s, i) => (
            <span key={i} className="px-2.5 py-1 bg-blue-600/20 text-blue-300 rounded-full text-xs font-medium border border-blue-500/20">
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Step: type */}
      {step === STEP_TYPE && (
        <>
          <h2 className="text-lg font-semibold text-slate-100 mb-6 text-center">What do you want to create?</h2>
          <div className="flex flex-wrap gap-2.5 justify-center max-w-lg">
            {TYPE_CHIPS.map(c => (
              <Chip key={c.value} label={c.label} emoji={c.emoji} onClick={() => { setTypeVal(c.value); setStep(STEP_CLASS) }} />
            ))}
          </div>
        </>
      )}

      {/* Step: class */}
      {step === STEP_CLASS && (
        <>
          <h2 className="text-lg font-semibold text-slate-100 mb-6 text-center">For which class?</h2>
          <div className="flex flex-wrap gap-2.5 justify-center max-w-lg">
            {CLASS_CHIPS.map(c => (
              <Chip key={c.value} label={c.label} onClick={() => { setClassVal(c.value); setStep(STEP_FOCUS) }} />
            ))}
          </div>
        </>
      )}

      {/* Step: focus (multi-select) */}
      {step === STEP_FOCUS && (
        <>
          <h2 className="text-lg font-semibold text-slate-100 mb-2 text-center">What's the focus?</h2>
          <p className="text-sm text-slate-500 mb-5 text-center">Select one or more</p>
          <div className="flex flex-wrap gap-2.5 justify-center max-w-lg mb-6">
            {FOCUS_CHIPS.map(c => (
              <Chip key={c.value} label={c.label} active={focusVals.includes(c.value)} onClick={() => toggleFocus(c.value)} />
            ))}
          </div>
          <button
            onClick={() => focusVals.length && setStep(STEP_VARIANTS)}
            disabled={!focusVals.length}
            className="btn gap-2"
          >
            Next <ArrowRight size={14} />
          </button>
        </>
      )}

      {/* Step: variants */}
      {step === STEP_VARIANTS && (
        <>
          <h2 className="text-lg font-semibold text-slate-100 mb-2 text-center">What do you need?</h2>
          <p className="text-sm text-slate-500 mb-5 text-center">Choose which versions to generate</p>
          <div className="flex flex-col gap-3 w-full max-w-sm mb-6">
            {VARIANT_CHIPS.map(v => {
              const active = JSON.stringify(variants) === JSON.stringify(v.value)
              return (
                <button
                  key={v.label}
                  onClick={() => setVariants(v.value)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                    active
                      ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                      : 'bg-slate-800 border-slate-700 text-slate-200 hover:border-slate-600'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${active ? 'border-blue-500 bg-blue-500' : 'border-slate-600'}`}>
                    {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{v.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{v.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
          <button onClick={() => setStep(STEP_DOCS)} className="btn gap-2">
            Next <ArrowRight size={14} />
          </button>
        </>
      )}

      {/* Step: docs */}
      {step === STEP_DOCS && (
        <>
          <h2 className="text-lg font-semibold text-slate-100 mb-2 text-center">Any reference materials?</h2>
          <p className="text-sm text-slate-500 mb-5 text-center">Select curriculum docs for MARTY to draw from</p>
          {docs.length === 0 ? (
            <p className="text-slate-600 text-sm mb-6">No docs uploaded yet — MARTY will work from context alone.</p>
          ) : (
            <div className="w-full max-w-sm space-y-2 mb-6">
              {docs.map(d => (
                <label key={d.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 hover:border-slate-600 cursor-pointer transition-colors">
                  <input type="checkbox" checked={selectedDocIds.includes(d.id)} onChange={() => toggleDoc(d.id)} className="accent-blue-500" />
                  <div>
                    <p className="text-sm text-slate-200 font-medium">{d.title ?? d.filename}</p>
                    {d.subject && <p className="text-xs text-slate-500">{d.subject}</p>}
                  </div>
                </label>
              ))}
            </div>
          )}
          <button onClick={handleSubmit} className="btn btn-lg gap-2">
            Send to MARTY <ArrowRight size={15} />
          </button>
        </>
      )}

      <div className="flex items-center gap-4 mt-6">
        {step > 0 && (
          <button onClick={back} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
            <ArrowLeft size={12} /> Back
          </button>
        )}
        <span className="text-slate-700 text-xs">or just type below</span>
      </div>
    </div>
  )
}
