interface LoadingPulseProps {
  label?: string
  fullscreen?: boolean
}

export const LoadingPulse: React.FC<LoadingPulseProps> = ({
  label = 'Syncing workspace',
  fullscreen = false,
}) => {
  return (
    <div className={fullscreen ? 'min-h-screen flex items-center justify-center px-4' : 'flex items-center justify-center py-6'}>
      <div className="flex flex-col items-center gap-3">
        <div className="relative h-12 w-12">
          <span className="absolute inset-0 rounded-full border-2 border-indigo-200 dark:border-indigo-900 animate-ping" />
          <span className="absolute inset-1 rounded-full border-2 border-indigo-500 dark:border-indigo-400 border-t-transparent animate-spin" />
          <span className="absolute inset-[0.85rem] rounded-full bg-indigo-500 dark:bg-indigo-400" />
        </div>
        <p className="text-xs tracking-wide uppercase text-indigo-700 dark:text-indigo-300">{label}</p>
      </div>
    </div>
  )
}