import { createSignal, type Component } from 'solid-js'
import { refreshSessionAfterAuth } from '~/lib/authClient'

interface RefreshSessionButtonProps {
  className?: string
}

export const RefreshSessionButton: Component<RefreshSessionButtonProps> = (props) => {
  const [isRefreshing, setIsRefreshing] = createSignal(false)
  
  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refreshSessionAfterAuth()
      // Force a page reload to ensure UI updates
      window.location.reload()
    } catch (err) {
      console.error('Session refresh error:', err)
    } finally {
      setIsRefreshing(false)
    }
  }
  
  return (
    <button
      type="button"
      disabled={isRefreshing()}
      onClick={handleRefresh}
      class={`px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50 ${props.className || ''}`}
    >
      {isRefreshing() ? 'Refreshing...' : 'Refresh Session'}
    </button>
  )
} 