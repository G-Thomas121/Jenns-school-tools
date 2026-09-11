import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'

interface Step {
  question: string
  chips: { label: string; value: string; emoji?: string }[]
}

const STEPS: Step[] = [
  {
    question: 'What do you want to create?',
    chips: [
      { label: 'Worksheet', value: 'a worksheet', emoji: '📝' },
      { label: 'Foldable', value: 'a foldable', emoji: '📂' },
      { label: 'Slideshow', value: 'a slideshow', emoji: '🖥' },
      { label: 'Lesson Plan', value: 'a lesson plan', emoji: '📋' },
      { label: 'Study Guide', value: 'a study guide', emoji: '📚' },
    ],
  },
  {
    question: 'For which class?',
    chips: [
      { label: 'English 1 — 9th grade', value: 'for English 1 (9th grade)' },
      { label: 'English 2 — 10th grade', value: 'for English 2 (10th grade)' },
      { label: 'Both classes', value: 'for both English 1 and English 2' },
    ],
  },
  {
    question: "What's the focus?",
    chips: [
      { label: 'Textual evidence', value: 'focused on citing textual evidence' },
      { label: 'Vocabulary', value: 'focused on vocabulary' },
      { label: 'Reading comprehension', value: 'focused on reading comprehension' },
      { label: 'Character analysis', value: 'focused on character analysis' },
      { label: 'Theme & symbolism', value: 'focused on theme and symbolism' },
      { label: 'Writing practice', value: 'focused on a writing activity' },
      { label: 'Grammar & conventions', value: 'focused on grammar and conventions' },
      { label: 'Plot & structure', value: 'focused on plot and narrative structure' },
    ],
  },
]

interface Props {
  onPrompt: (prompt: string) => void
}

export default function PromptChips({ onPrompt }: Props) {
  const [step, setStep] = useState(0)
  const [selections, setSelections] = useState<string[]>([])

  const handleChip = (value: string) => {
    const next = [...selections, value]
    if (step < STEPS.length - 1) {
      setSelections(next)
      setStep(step + 1)
    } else {
      // Final step — assemble and send
      const prompt = `Create ${next[0]} ${next[1]} ${next[2]}.`
      onPrompt(prompt)
    }
  }

  const handleBack = () => {
    setStep(step - 1)
    setSelections(selections.slice(0, -1))
  }

  const current = STEPS[step]

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-8 py-12">
      {/* MARTY avatar */}
      <div className="w-14 h-14 rounded-full bg-blue-700 flex items-center justify-center text-xl font-bold text-white mb-6 shadow-lg shadow-blue-900/40">
        M
      </div>

      {/* Progress dots */}
      <div className="flex gap-1.5 mb-6">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i < step ? 'w-6 bg-blue-500' : i === step ? 'w-6 bg-blue-400' : 'w-1.5 bg-slate-700'
            }`}
          />
        ))}
      </div>

      {/* Breadcrumb of selections */}
      {selections.length > 0 && (
        <div className="flex items-center gap-1.5 mb-5 flex-wrap justify-center">
          {selections.map((s, i) => (
            <span key={i} className="px-2.5 py-1 bg-blue-600/20 text-blue-300 rounded-full text-xs font-medium border border-blue-500/20">
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Question */}
      <h2 className="text-lg font-semibold text-slate-100 mb-6 text-center">{current.question}</h2>

      {/* Chips */}
      <div className="flex flex-wrap gap-2.5 justify-center max-w-lg">
        {current.chips.map(chip => (
          <button
            key={chip.value}
            onClick={() => handleChip(chip.value)}
            className="px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200
                       hover:bg-slate-700 hover:border-blue-500/50 hover:text-white
                       transition-all duration-150 active:scale-95"
          >
            {chip.emoji && <span className="mr-1.5">{chip.emoji}</span>}
            {chip.label}
          </button>
        ))}
      </div>

      {/* Back + skip */}
      <div className="flex items-center gap-4 mt-8">
        {step > 0 && (
          <button onClick={handleBack} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
            <ArrowLeft size={12} /> Back
          </button>
        )}
        <span className="text-slate-700 text-xs">or just type below</span>
      </div>
    </div>
  )
}
