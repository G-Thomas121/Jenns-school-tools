import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getWorkflows } from '../api'
import { formatDate, typeBadge, gradeBadge } from '../utils'

export default function Dashboard() {
  const { data: workflows = [] } = useQuery({ queryKey: ['workflows'], queryFn: getWorkflows })
  const recent = workflows.slice(0, 6)

  const counts = {
    total: workflows.length,
    worksheet: workflows.filter(w => w.type === 'worksheet').length,
    foldable: workflows.filter(w => w.type === 'foldable').length,
    lesson_plan: workflows.filter(w => w.type === 'lesson_plan').length,
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
      <p className="text-slate-400 text-sm mb-8">Welcome back, Jenn!</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Materials', value: counts.total },
          { label: 'Worksheets', value: counts.worksheet },
          { label: 'Foldables', value: counts.foldable },
          { label: 'Lesson Plans', value: counts.lesson_plan },
        ].map(s => (
          <div key={s.label} className="card">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-3xl font-bold mt-1 text-white">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Recent Materials</h2>
          <Link to="/chat" className="btn btn-sm">💬 Chat with MARTY</Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-slate-500 text-sm py-6 text-center">
            Nothing here yet. <Link to="/chat" className="text-blue-400">Chat with MARTY</Link> to create your first material.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs border-b border-slate-800">
                <th className="text-left py-2 font-medium">Name</th>
                <th className="text-left py-2 font-medium">Type</th>
                <th className="text-left py-2 font-medium">Class</th>
                <th className="text-left py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(w => (
                <tr key={w.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5">
                    <Link to={`/workflows/${w.id}`} className="text-blue-400 hover:text-blue-300 font-medium">{w.name}</Link>
                  </td>
                  <td className="py-2.5" dangerouslySetInnerHTML={{ __html: typeBadge(w.type) }} />
                  <td className="py-2.5" dangerouslySetInnerHTML={{ __html: gradeBadge(w.grade) }} />
                  <td className="py-2.5 text-slate-500">{formatDate(w.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { to: '/chat', emoji: '💬', title: 'Chat with MARTY', sub: 'Create anything' },
          { to: '/workflows', emoji: '📂', title: 'My Materials', sub: 'Everything MARTY made' },
          { to: '/documents', emoji: '📚', title: 'Curriculum Docs', sub: 'Manage references' },
          { to: '/students', emoji: '👥', title: 'Class Roster', sub: 'Manage students' },
        ].map(q => (
          <Link key={q.to} to={q.to} className="card hover:border-slate-600 transition-colors cursor-pointer no-underline">
            <div className="text-2xl mb-2">{q.emoji}</div>
            <p className="font-medium text-sm text-white">{q.title}</p>
            <p className="text-xs text-slate-500 mt-0.5">{q.sub}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
