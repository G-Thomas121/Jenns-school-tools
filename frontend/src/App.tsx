import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Chat from './pages/Chat'
import Dashboard from './pages/Dashboard'
import Workflows from './pages/Workflows'
import WorkflowNew from './pages/WorkflowNew'
import WorkflowDetail from './pages/WorkflowDetail'
import Documents from './pages/Documents'
import ContextNotes from './pages/ContextNotes'
import Students from './pages/Students'
import Gradebook from './pages/Gradebook'
import Suggestions from './pages/Suggestions'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/chat/:convId" element={<Chat />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/workflows" element={<Workflows />} />
        <Route path="/workflows/new" element={<WorkflowNew />} />
        <Route path="/workflows/:id" element={<WorkflowDetail />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/context" element={<ContextNotes />} />
        <Route path="/students" element={<Students />} />
        <Route path="/gradebook" element={<Gradebook />} />
        <Route path="/suggestions" element={<Suggestions />} />
      </Routes>
    </Layout>
  )
}
