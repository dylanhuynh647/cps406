import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoadingPulse } from './components/LoadingPulse'
import { Navbar } from './components/Navbar'
import { isSupabaseConfigured } from './lib/supabase'
import { useQueryClient } from '@tanstack/react-query'

const Auth = lazy(() => import('./pages/Auth'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Profile = lazy(() => import('./pages/Profile'))
const Artifacts = lazy(() => import('./pages/Artifacts'))
const ArtifactDetail = lazy(() => import('./pages/ArtifactDetail'))
const ArtifactNew = lazy(() => import('./pages/ArtifactNew'))
const Bugs = lazy(() => import('./pages/Bugs'))
const BugDetail = lazy(() => import('./pages/BugDetail'))
const BugNew = lazy(() => import('./pages/BugNew'))
const Inbox = lazy(() => import('./pages/Inbox'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
    },
  },
})

function App() {
  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-white rounded-lg shadow p-6 border border-gray-200">
          <h1 className="text-2xl font-semibold text-gray-900 mb-3">Configuration Required</h1>
          <p className="text-gray-700 mb-2">
            The frontend loaded, but Supabase environment variables are missing.
          </p>
          <p className="text-sm text-gray-600 mb-4">
            Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your environment file
            (for example, <code>.env</code>) and restart the Vite dev server.
          </p>
        </div>
      </div>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthQueryCacheBridge />
        <Router>
          <div className="min-h-screen bg-gray-50">
            <Navbar />
            <main className="pt-16">
              <Suspense fallback={<LoadingPulse fullscreen label="Loading page" />}>
                <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute>
                        <Dashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/profile"
                    element={
                      <ProtectedRoute>
                        <Profile />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/artifacts"
                    element={
                      <ProtectedRoute>
                        <Artifacts />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/artifacts/new"
                    element={
                      <ProtectedRoute>
                        <ArtifactNew />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/artifacts/:id"
                    element={
                      <ProtectedRoute>
                        <ArtifactDetail />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/bugs"
                    element={
                      <ProtectedRoute>
                        <Bugs />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/bugs/new"
                    element={
                      <ProtectedRoute>
                        <BugNew />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/bugs/:id"
                    element={
                      <ProtectedRoute>
                        <BugDetail />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/inbox"
                    element={
                      <ProtectedRoute>
                        <Inbox />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </Suspense>
            </main>
            <Toaster position="top-right" />
          </div>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  )
}

const AuthQueryCacheBridge = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const lastUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    const currentUserId = user?.id ?? null
    if (lastUserIdRef.current !== currentUserId) {
      queryClient.clear()
      lastUserIdRef.current = currentUserId
    }
  }, [queryClient, user?.id])

  return null
}

export default App
