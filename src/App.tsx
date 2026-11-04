import { Route, Routes } from 'react-router'
import HomePage from './pages/HomePage.tsx'
import NotFoundPage from './pages/NotFoundPage.tsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
