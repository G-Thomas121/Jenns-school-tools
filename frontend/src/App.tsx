import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Chat from './pages/Chat'
import Suggestions from './pages/Suggestions'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/chat/:convId" element={<Chat />} />
        <Route path="/suggestions" element={<div className="h-full overflow-y-auto"><Suggestions /></div>} />
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </Layout>
  )
}
