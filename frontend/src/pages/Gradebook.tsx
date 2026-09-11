import { useQuery } from '@tanstack/react-query'
import { getGradebookSummary } from '../api'

function pctColor(pct: number | null) {
  if (pct === null) return 'bg-slate-500/15 text-slate-400'
  if (pct >= 90) return 'bg-green-500/15 text-green-400'
  if (pct >= 70) return 'bg-yellow-500/15 text-yellow-400'
  return 'bg-red-500/15 text-red-400'
}

export default function Gradebook() {
  const { data: summary = [] } = useQuery({ queryKey: ['gradebook-summary'], queryFn: () => getGradebookSummary() })

  const e1 = summary.filter(s => s.grade === 'english1')
  const e2 = summary.filter(s => s.grade === 'english2')

  const Table = ({ students, label }: { students: typeof summary; label: string }) => (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">{label}</h2>
        <a href={`/api/gradebook/export?grade=${students[0]?.grade ?? ''}`} download className="btn btn-sm btn-outline">Export CSV</a>
      </div>
      {students.length === 0 ? (
        <p className="text-slate-500 text-sm">No students. Add them in the Class Roster.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 text-xs border-b border-slate-800">
              <th className="text-left py-2 font-medium">Student</th>
              <th className="text-left py-2 font-medium">Graded</th>
              <th className="text-left py-2 font-medium">Average</th>
            </tr>
          </thead>
          <tbody>
            {students.map(s => (
              <tr key={s.id} className="border-b border-slate-800/50">
                <td className="py-2.5 font-medium text-slate-200">{s.name}</td>
                <td className="py-2.5 text-slate-400">{s.graded_count} assignment{s.graded_count !== 1 ? 's' : ''}</td>
                <td className="py-2.5">
                  <span className={`badge ${pctColor(s.avg_pct)}`}>
                    {s.avg_pct !== null ? `${s.avg_pct}%` : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Gradebook</h1>
        <a href="/api/gradebook/export" download className="btn btn-outline">Export All CSV</a>
      </div>
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-sm text-blue-300 mb-6">
        Ask MARTY to grade submissions in chat. Results will appear here automatically.
      </div>
      <Table students={e1} label="English 1 — 9th Grade" />
      <Table students={e2} label="English 2 — 10th Grade" />
    </div>
  )
}
