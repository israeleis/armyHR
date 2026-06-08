import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { RtlProvider } from '@/components/RtlProvider'
import { router } from './router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,   // 5 min
      gcTime: 1000 * 60 * 30,      // 30 min
      retry: (failureCount, error) => {
        // Don't retry on auth errors (401/403)
        if (error instanceof Error && error.message.includes('401')) return false
        if (error instanceof Error && error.message.includes('403')) return false
        return failureCount < 3
      },
    },
  },
})

export default function App() {
  return (
    <RtlProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </RtlProvider>
  )
}
