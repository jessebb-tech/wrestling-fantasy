import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Lobby from './pages/Lobby'
import DraftRoom from './pages/DraftRoom'
import Scores from './pages/Scores'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/draft" element={<DraftRoom />} />
        <Route path="/scores" element={<Scores />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
