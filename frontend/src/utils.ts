export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const TYPE_COLORS: Record<string, string> = {
  worksheet: 'bg-blue-500/15 text-blue-400',
  foldable: 'bg-purple-500/15 text-purple-400',
  slideshow: 'bg-green-500/15 text-green-400',
  study_guide: 'bg-yellow-500/15 text-yellow-400',
  lesson_plan: 'bg-yellow-500/15 text-yellow-400',
  custom: 'bg-slate-500/15 text-slate-400',
}

const GRADE_LABELS: Record<string, string> = {
  english1: 'English 1',
  english2: 'English 2',
  both: 'Both',
}

export function typeBadge(type: string): string {
  const cls = TYPE_COLORS[type] ?? 'bg-slate-500/15 text-slate-400'
  return `<span class="badge ${cls}">${type.replace('_', ' ')}</span>`
}

export function gradeBadge(grade: string): string {
  return `<span class="badge bg-slate-500/15 text-slate-400">${GRADE_LABELS[grade] ?? grade}</span>`
}
