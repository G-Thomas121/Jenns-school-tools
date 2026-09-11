import { NavLink, useNavigate } from 'react-router-dom'
import { MessageSquare, LayoutDashboard, FolderOpen, BookOpen, Brain, Users, BarChart2, Lightbulb, Plus } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getConversations } from '../api'

const NavItem = ({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
        isActive
          ? 'bg-blue-600/20 text-blue-400 font-medium'
          : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
      }`
    }
  >
    <Icon size={15} />
    {label}
  </NavLink>
)

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations'],
    queryFn: getConversations,
    refetchInterval: 10_000,
  })

  const handleNewChat = () => navigate('/chat')

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <nav className="w-56 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <div className="font-bold text-white text-base tracking-wide">MARTY</div>
          <div className="text-xs text-slate-500 mt-0.5">Jenn's Teaching Assistant</div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">

          {/* New Chat — always visible, always clickable */}
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <Plus size={15} />
            New Chat
          </button>

          {/* Recent conversations */}
          {conversations.slice(0, 8).map(c => (
            <NavLink
              key={c.id}
              to={`/chat/${c.id}`}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  isActive ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                }`
              }
            >
              <MessageSquare size={12} className="flex-shrink-0 opacity-50" />
              <span className="truncate">{c.title}</span>
            </NavLink>
          ))}

          <div className="pt-3 pb-0.5 px-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Library</span>
          </div>
          <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
          <NavItem to="/workflows" icon={FolderOpen} label="My Materials" />
          <NavItem to="/documents" icon={BookOpen} label="Curriculum Docs" />
          <NavItem to="/context" icon={Brain} label="My Context" />

          <div className="pt-3 pb-0.5 px-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Grading</span>
          </div>
          <NavItem to="/students" icon={Users} label="Class Roster" />
          <NavItem to="/gradebook" icon={BarChart2} label="Gradebook" />
        </div>

        <div className="p-2 border-t border-slate-800">
          <NavItem to="/suggestions" icon={Lightbulb} label="Suggestions" />
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
