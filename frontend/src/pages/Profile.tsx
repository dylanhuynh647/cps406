import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import toast from 'react-hot-toast'

const profileSchema = z.object({
  full_name: z.string().optional(),
  avatar_url: z.string().url('Invalid URL').optional().or(z.literal('')),
})

type ProfileFormData = z.infer<typeof profileSchema>

export default function Profile() {
  const { profile, refreshProfile } = useAuth()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
  })

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await api.get('/user/me')
        reset({
          full_name: response.data.full_name || '',
          avatar_url: response.data.avatar_url || '',
        })
      } catch (error: any) {
        toast.error('Failed to load profile')
      } finally {
        setFetching(false)
      }
    }

    fetchProfile()
  }, [reset])

  const onSubmit = async (data: ProfileFormData) => {
    setLoading(true)
    try {
      await api.patch('/user/me', {
        full_name: data.full_name || null,
        avatar_url: data.avatar_url || null,
      })
      await refreshProfile()
      toast.success('Profile updated successfully!')
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  if (fetching) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Profile Settings</h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email (read-only)
            </label>
            <input
              type="email"
              value={profile?.email || ''}
              disabled
              className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-gray-50 rounded-md text-gray-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700">
              Role (read-only)
            </label>
            <input
              type="text"
              value={profile?.role || ''}
              disabled
              className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-gray-50 rounded-md text-gray-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="full_name" className="block text-sm font-medium text-gray-700">
              Full Name
            </label>
            <input
              {...register('full_name')}
              type="text"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="Enter your full name"
            />
            {errors.full_name && (
              <p className="mt-1 text-sm text-red-600">{errors.full_name.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="avatar_url" className="block text-sm font-medium text-gray-700">
              Avatar URL
            </label>
            <input
              {...register('avatar_url')}
              type="url"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="https://example.com/avatar.jpg"
            />
            {errors.avatar_url && (
              <p className="mt-1 text-sm text-red-600">{errors.avatar_url.message}</p>
            )}
            {profile?.avatar_url && (
              <div className="mt-2">
                <img
                  src={profile.avatar_url}
                  alt="Avatar"
                  className="h-16 w-16 rounded-full object-cover"
                />
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Notification Preferences</h3>
            <p className="text-sm text-gray-500">Coming soon...</p>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
