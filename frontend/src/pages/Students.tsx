import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, UserPlus } from 'lucide-react'
import { getStudents, createStudent, updateStudent, deleteStudent } from '../api'
import type { Grade } from '../types'

export default function Students() {
  const qc = useQueryClient()
  const { data: students = [] } = useQuery({ queryKey: ['students'], queryFn: getStudents })
  const [newName, setNewName] = useState('')
  const [newGrade, setNewGrade] = useState<Grade>('english1')
  const [bulkNames, setBulkNames] = useState('')
  const [bulkGrade, setBulkGrade] = useState<Grade>('english1')

  const create = useMutation({
    mutationFn: (data: { name: string; grade: Grade }) => createStudent(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['students'] }); setNewName('') },
  })

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => updateStudent(id, { active: active ? 1 : 0 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['students'] }),
  })

  const del = useMutation({
    mutationFn: (id: number) => deleteStudent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['students'] }),
  })

  const bulkAdd = async () => {
    const names = bulkNames.split('\n').map(n => n.trim()).filter(Boolean)
    for (const name of names) await createStudent({ name, grade: bulkGrade })
    qc.invalidateQueries({ queryKey: ['students'] })
    setBulkNames('')
  }

  const e1 = students.filter(s => s.grade === 'english1')
  const e2 = students.filter(s => s.grade === 'english2')

  const RosterTable = ({ list, label }: { list: typeof students; label: string }) => (
    <div className="card mb-4">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="font-semibold">{label}</h2>
        <span className="badge bg-slate-500/15 text-slate-400">{list.length}</span>
      </div>
      {list.length === 0 ? <p className="text-slate-500 text-sm">No students yet.</p> : (
        <div className="space-y-1">
          {list.map(s => (
            <div key={s.id} className={`flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800/40 ${s.active ? '' : 'opacity-50'}`}>
              <span className="text-sm text-slate-200">{s.name}</span>
              <div className="flex gap-1">
                <button onClick={() => toggle.mutate({ id: s.id, active: !s.active })}
                  className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${s.active ? 'text-green-400 bg-green-400/10 hover:bg-green-400/20' : 'text-slate-500 bg-slate-700 hover:bg-slate-600'}`}>
                  {s.active ? 'Active' : 'Inactive'}
                </button>
                <button onClick={() => { if (confirm(`Remove ${s.name}?`)) del.mutate(s.id) }} className="btn btn-sm btn-ghost p-1 text-red-400"><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Class Roster</h1>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="card">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><UserPlus size={15} /> Add One Student</h2>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="label text-xs">Name</label>
              <input className="input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full name" onKeyDown={e => e.key === 'Enter' && newName && create.mutate({ name: newName, grade: newGrade })} />
            </div>
            <div>
              <label className="label text-xs">Class</label>
              <select className="input" value={newGrade} onChange={e => setNewGrade(e.target.value as Grade)}>
                <option value="english1">English 1</option>
                <option value="english2">English 2</option>
              </select>
            </div>
            <button onClick={() => newName && create.mutate({ name: newName, grade: newGrade })} className="btn">Add</button>
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-4">Bulk Add</h2>
          <div className="mb-3">
            <label className="label text-xs">Class</label>
            <select className="input mb-2" value={bulkGrade} onChange={e => setBulkGrade(e.target.value as Grade)}>
              <option value="english1">English 1 (9th)</option>
              <option value="english2">English 2 (10th)</option>
            </select>
            <textarea className="input" rows={3} value={bulkNames} onChange={e => setBulkNames(e.target.value)} placeholder={"One name per line:\nEmma Jones\nMarcus Williams"} />
          </div>
          <button onClick={bulkAdd} disabled={!bulkNames.trim()} className="btn btn-sm">Add All</button>
        </div>
      </div>

      <RosterTable list={e1} label="English 1 — 9th Grade" />
      <RosterTable list={e2} label="English 2 — 10th Grade" />
    </div>
  )
}
