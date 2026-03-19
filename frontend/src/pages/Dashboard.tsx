
import { useAuth } from '../contexts/AuthContext'
import { Link } from 'react-router-dom'

export default function Dashboard() {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">You are not logged in.</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Welcome, {profile?.full_name || user?.email}!
        </h1>
        <p className="text-gray-600 mb-4">
          You are logged in as <span className="font-semibold">{profile?.role || 'user'}</span>.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="bg-indigo-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-indigo-900">Artifacts</h3>
            <p className="text-indigo-700 mt-2">Manage development artifacts</p>
            <Link
              to="/artifacts"
              className="mt-4 inline-block text-indigo-600 hover:text-indigo-800 font-medium"
            >
              View Artifacts →
            </Link>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-green-900">Bugs</h3>
            <p className="text-green-700 mt-2">Track and manage bugs</p>
            <Link
              to="/bugs"
              className="mt-4 inline-block text-green-600 hover:text-green-800 font-medium"
            >
              View Bugs →
            </Link>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-purple-900">Profile</h3>
            <p className="text-purple-700 mt-2">Update your profile settings</p>
            <Link
              to="/profile"
              className="mt-4 inline-block text-purple-600 hover:text-purple-800 font-medium"
            >
              View Profile →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
