import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'
import toast from 'react-hot-toast'

const artifactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string().min(1, 'Type is required'),
  description: z.string().optional(),
  reference: z.string().min(1, 'Reference is required'),
})

type ArtifactFormData = z.infer<typeof artifactSchema>

const artifactTypes = [
  'product_backlog',
  'design_document',
  'diagram',
  'formal_spec',
  'source_file',
  'test_source_file',
  'binary',
  'data_file',
  'other',
]

export default function ArtifactNew() {
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ArtifactFormData>({
    resolver: zodResolver(artifactSchema),
  })

  const createMutation = useMutation({
    mutationFn: async (data: ArtifactFormData) => {
      return api.post('/artifacts', data)
    },
    onSuccess: (response) => {
      toast.success('Artifact created successfully!')
      navigate(`/artifacts/${response.data.id}`)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to create artifact')
    },
  })

  const onSubmit = (data: ArtifactFormData) => {
    createMutation.mutate(data)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Create New Artifact</h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Name *
            </label>
            <input
              {...register('name')}
              type="text"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="Artifact name"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700">
              Type *
            </label>
            <select
              {...register('type')}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            >
              <option value="">Select a type</option>
              {artifactTypes.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            {errors.type && (
              <p className="mt-1 text-sm text-red-600">{errors.type.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              {...register('description')}
              rows={4}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="Artifact description"
            />
          </div>

          <div>
            <label htmlFor="reference" className="block text-sm font-medium text-gray-700">
              Reference (URL or path) *
            </label>
            <input
              {...register('reference')}
              type="text"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="https://example.com/artifact or /path/to/file"
            />
            {errors.reference && (
              <p className="mt-1 text-sm text-red-600">{errors.reference.message}</p>
            )}
          </div>

          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => navigate('/artifacts')}
              className="bg-gray-300 hover:bg-gray-400 text-gray-900 border border-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white dark:border-gray-500 px-4 py-2 rounded-md text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Artifact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
