import { Route, Routes } from 'react-router'
import AuthProvider from './auth/AuthProvider.tsx'
import ProtectedRoute from './components/ProtectedRoute.tsx'
import ComingSoonPage from './pages/ComingSoonPage.tsx'
import DashboardPage from './pages/DashboardPage.tsx'
import HomePage from './pages/HomePage.tsx'
import LoginPage from './pages/LoginPage.tsx'
import NotFoundPage from './pages/NotFoundPage.tsx'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/surveys/new" element={<ComingSoonPage title="New Survey" phase={5} />} />
          <Route
            path="/surveys/:id/edit"
            element={<ComingSoonPage title="Edit Survey" phase={5} />}
          />
          <Route
            path="/surveys/:id/present"
            element={<ComingSoonPage title="Present Survey" phase={6} />}
          />
          <Route
            path="/surveys/:id/results"
            element={<ComingSoonPage title="Results" phase={9} />}
          />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  )
}
