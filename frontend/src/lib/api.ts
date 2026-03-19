import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'
import { supabase } from './supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: `${API_URL}/api`,
})

type RetriableRequestConfig = AxiosRequestConfig & {
  _retry?: boolean
}

let currentAccessToken: string | null = null

supabase.auth.onAuthStateChange((_event, session) => {
  currentAccessToken = session?.access_token ?? null
})

void supabase.auth
  .getSession()
  .then(({ data: { session } }) => {
    currentAccessToken = session?.access_token ?? null
  })
  .catch(() => {
    currentAccessToken = null
  })

// Interceptor to attach auth token to all requests
api.interceptors.request.use(
  (config) => {
    if (currentAccessToken) {
      config.headers.Authorization = `Bearer ${currentAccessToken}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Interceptor to handle 401 errors (unauthorized)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true

      const { data, error: refreshError } = await supabase.auth.refreshSession()

      if (!refreshError && data.session?.access_token) {
        currentAccessToken = data.session.access_token
        originalRequest.headers = {
          ...(originalRequest.headers || {}),
          Authorization: `Bearer ${data.session.access_token}`,
        }
        return api(originalRequest)
      }

      currentAccessToken = null
      await supabase.auth.signOut()
      window.location.href = '/auth'
    }

    return Promise.reject(error)
  }
)
