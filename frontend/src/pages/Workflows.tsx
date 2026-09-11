import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Trash2, Copy } from 'lucide-react'
import { getWorkflows, deleteWorkflow } from '../api'
import { formatDate, typeBadge, gradeBadge } from '../utils'

export default function Workflows() {
  const qc = useQueryClient()
  const { data: workflows = [], isLoading } = useQuery({ queryKey: ['workflows'], queryFn: getWorkflows })

  const del = useMutation({
    mutationFn: (id: number) => deleteWorkflow(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  })

  if (isLoading) return <div className="p-8 text-slate-500">Loading…</div>

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">My Materials</h1>
          <p className="text-slate-400 text-sm mt-0.5">Everything MARTY has created — {workflows.length} total. Chat to make more.</p>
        </div>
        <Link to="/workflows/new" className="btn btn-outline">+ Manual Workflow</Link>
      </div>

      {workflows.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-slate-500 mb-4">No workflows yet.</p>
          <Link to="/chat" className="btn">Chat with MARTY to create one</Link>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs border-b border-slate-800">
                <th className="text-left px-5 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Class</th>
                <th className="text-left px-4 py-3 font-medium">Versions</th>
                <th className="text-left px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {workflows.map(w => (
                <tr key={w.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                  <td className="px-5 py-3">
                    <Link to={`/workflows/${w.id}`} className="text-blue-400 hover:text-blue-300 font-medium">{w.name}</Link>
                  </td>
                  <td className="px-4 py-3" dangerouslySetInnerHTML={{ __html: typeBadge(w.type) }} />
                  <td className="px-4 py-3" dangerouslySetInnerHTML={{ __html: gradeBadge(w.grade) }} />
                  <td className="px-4 py-3 text-slate-400">{w.output_count ?? 0}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(w.updated_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Link to={`/workflows/new?from=${w.id}`} className="btn btn-sm btn-ghost p-1.5" title="Use as template">
                        <Copy size={13} />
                      </Link>
                      <button
                        onClick={() => { if (confirm(`Delete "${w.name}"?`)) del.mutate(w.id) }}
                        className="btn btn-sm btn-ghost p-1.5 text-red-400"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
