import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { Suspense } from 'react'
import ReactDOM from 'react-dom/client'

import { routeTree } from './routeTree.gen'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      throwOnError: (_error, query) => query.state.data === undefined,
    },
  },
})

const router = createRouter({
  routeTree,
  context: { queryClient },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.querySelector('#app')

if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)

  root.render(
    <QueryClientProvider client={queryClient}>
      <Suspense>
        <RouterProvider router={router} />
      </Suspense>
    </QueryClientProvider>
  )
}
