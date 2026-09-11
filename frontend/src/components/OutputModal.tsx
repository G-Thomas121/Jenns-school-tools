import { useState, useEffect } from 'react'
import { X, Printer, ExternalLink, Download, Presentation } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getOutput, downloadUrl, pptxUrl } from '../api'
import type { OutputVariant } from '../types'

interface Props {
  workflowId: number
  outputId: number
  variant: OutputVariant
  title?: string
  onClose: () => void
}

export default function OutputModal({ workflowId, outputId, variant, title, onClose }: Props) {
  const [activeVariant, setActiveVariant] = useState<OutputVariant>(variant)

  const { data: output } = useQuery({
    queryKey: ['output', workflowId, outputId],
    queryFn: () => getOutput(workflowId, outputId),
  })

  const htmlMap: Record<OutputVariant, string | null | undefined> = {
    student: output?.html,
    teacher: output?.teacher_html,
    slideshow: output?.slideshow_html,
  }

  const currentHtml = htmlMap[activeVariant] ?? ''

  const VARIANTS: { key: OutputVariant; label: string }[] = [
    { key: 'student', label: 'Student' },
    { key: 'teacher', label: 'Teacher Key' },
    { key: 'slideshow', label: 'Slideshow' },
  ]

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-stretch">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative flex flex-col w-[92vw] max-w-6xl h-[94vh] m-auto bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-100 text-sm">{title ?? 'Output Preview'}</span>
            <div className="flex gap-1">
              {VARIANTS.map(v => (
                <button
                  key={v.key}
                  onClick={() => setActiveVariant(v.key)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    activeVariant === v.key
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href={downloadUrl(outputId, activeVariant)} download className="btn btn-sm btn-outline">
              <Download size={12} /> HTML
            </a>
            {activeVariant === 'slideshow' && (
              <a href={pptxUrl(outputId)} download className="btn btn-sm btn-outline">
                <Presentation size={12} /> PPTX
              </a>
            )}
            <button
              className="btn btn-sm"
              onClick={() => {
                const w = window.open('', '_blank')
                if (w) { w.document.write(currentHtml); w.document.close(); w.print() }
              }}
            >
              <Printer size={12} /> Print
            </button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                const w = window.open('', '_blank')
                if (w) { w.document.write(currentHtml); w.document.close() }
              }}
            >
              <ExternalLink size={12} />
            </button>
            <button onClick={onClose} className="btn btn-sm btn-ghost p-1.5">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Preview iframe */}
        {!output ? (
          <div className="flex-1 flex items-center justify-center text-slate-500">Loading…</div>
        ) : !currentHtml ? (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            No {activeVariant} version for this output.
          </div>
        ) : (
          <iframe
            className="flex-1 border-0 bg-white"
            srcDoc={currentHtml}
            sandbox="allow-same-origin"
            title="Output Preview"
          />
        )}
      </div>
    </div>
  )
}
