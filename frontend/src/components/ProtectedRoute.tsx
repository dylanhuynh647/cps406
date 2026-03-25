import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LoadingPulse } from './LoadingPulse'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth()

  if (loading) {
    return <LoadingPulse fullscreen label="Preparing your workspace" />
  }

  if (!user) {
    return <Navigate to="/auth" replace />
  }

  return <>{children}</>
}
