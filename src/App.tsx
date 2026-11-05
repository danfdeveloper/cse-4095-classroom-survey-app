import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import AuthProvider from './auth/AuthProvider.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import ProtectedRoute from './components/ProtectedRoute.tsx'
import HomePage from './pages/HomePage.tsx'
import NotFoundPage from './pages/NotFoundPage.tsx'

// Route-level code splitting: students scanning a QR code download only the
// student page, not the instructor editor, dashboard, QR library or charts.
const LoginPage = lazy(() => import('./pages/LoginPage.tsx'))
const DashboardPage = lazy(() => import('./pages/DashboardPage.tsx'))
const SurveyEditorPage = lazy(() => import('./pages/SurveyEditorPage.tsx'))
const PresentPage = lazy(() => import('./pages/PresentPage.tsx'))
const ResultsPage = lazy(() => import('./pages/ResultsPage.tsx'))
const StudentSurveyPage = lazy(() => import('./pages/StudentSurveyPage.tsx'))

function PageLoading() {
  return (
    <p role="status" className="p-8 text-center text-slate-600">
      Loading...
    </p>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/s/:slug" element={<StudentSurveyPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/surveys/new" element={<SurveyEditorPage />} />
              <Route path="/surveys/:id/edit" element={<SurveyEditorPage />} />
              <Route path="/surveys/:id/present" element={<PresentPage />} />
              <Route path="/surveys/:id/results" element={<ResultsPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </ErrorBoundary>
  )
}
