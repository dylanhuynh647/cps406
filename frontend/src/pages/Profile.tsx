import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import toast from 'react-hot-toast'

const profileSchema = z.object({
  full_name: z.string().optional(),
})

type ProfileFormData = z.infer<typeof profileSchema>

export default function Profile() {
  const { user, profile, loading: authLoading, refreshProfile, setDarkModePreference } = useAuth()
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [themeUpdating, setThemeUpdating] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarDataToSave, setAvatarDataToSave] = useState<string | null | undefined>(undefined)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
  })

  useEffect(() => {
    let cancelled = false

    const loadProfile = async () => {
      if (authLoading) {
        return
      }

      if (!user) {
        if (!cancelled) {
          setFetching(false)
        }
        return
      }

      if (!profile) {
        await refreshProfile()
      }

      if (!cancelled) {
        setFetching(false)
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [authLoading, user, profile, refreshProfile])

  useEffect(() => {
    if (!profile) {
      return
    }

    reset({
      full_name: profile.full_name || '',
    })
    setAvatarPreview(profile.avatar_url || null)
    setAvatarDataToSave(undefined)
  }, [profile, reset])

  const handleAvatarFileChange = (event: { target: { files: FileList | null } }) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be 2MB or smaller')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null
      if (!result) {
        toast.error('Failed to read image')
        return
      }
      setAvatarPreview(result)
      setAvatarDataToSave(result)
    }
    reader.onerror = () => {
      toast.error('Failed to read image')
    }
    reader.readAsDataURL(file)
  }

  const onSubmit = async (data: ProfileFormData) => {
    setLoading(true)
    try {
      const nextAvatarUrl = avatarDataToSave !== undefined ? avatarDataToSave : profile?.avatar_url || null
      const nextFullName = data.full_name || null

      await api.patch('/user/me', {
        full_name: nextFullName,
        avatar_url: nextAvatarUrl,
      })

      if (user?.id) {
        queryClient.setQueryData(['bugs'], (existing: any) => {
          if (!Array.isArray(existing)) {
            return existing
          }

          return existing.map((bug: any) =>
            bug?.reporter_id === user.id
              ? {
                  ...bug,
                  reporter_avatar_url: nextAvatarUrl,
                  reporter_name: nextFullName || bug.reporter_name,
                }
              : bug
          )
        })

        queryClient.setQueriesData({ queryKey: ['bug'] }, (existing: any) => {
          if (!existing || typeof existing !== 'object') {
            return existing
          }

          return existing?.reporter_id === user.id
            ? {
                ...existing,
                reporter_avatar_url: nextAvatarUrl,
                reporter_name: nextFullName || existing.reporter_name,
              }
            : existing
        })
      }

      await refreshProfile()
      queryClient.invalidateQueries({ queryKey: ['bugs'] })
      queryClient.invalidateQueries({ queryKey: ['bug'] })
      queryClient.invalidateQueries({ queryKey: ['users', 'developers'] })
      queryClient.invalidateQueries({ queryKey: ['users', 'profiles'] })
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
            <label className="block text-sm font-medium text-gray-700">Profile Image</label>
            <div className="mt-2 flex items-center gap-4">
              <div className="h-16 w-16 overflow-hidden rounded-full border border-gray-300 bg-gray-100">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-gray-500">
                    {(profile?.full_name || profile?.email || '?').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarFileChange}
                  className="text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-700"
                />
                <button
                  type="button"
                  onClick={() => {
                    setAvatarPreview(null)
                    setAvatarDataToSave(null)
                  }}
                  className="w-fit text-sm text-indigo-600 hover:text-indigo-800"
                >
                  Remove Image
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">PNG/JPG/WebP up to 2MB.</p>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Appearance</h3>
            <label className="flex items-center justify-between rounded-md border border-gray-300 p-3">
              <span className="text-sm text-gray-700">Enable Dark Mode</span>
              <input
                type="checkbox"
                checked={!!profile?.dark_mode}
                disabled={themeUpdating}
                onChange={async (e) => {
                  const enabled = e.target.checked
                  setThemeUpdating(true)
                  try {
                    await setDarkModePreference(enabled)
                    toast.success(enabled ? 'Dark mode enabled' : 'Dark mode disabled')
                  } finally {
                    setThemeUpdating(false)
                  }
                }}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
            </label>
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
