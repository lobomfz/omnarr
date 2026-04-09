import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { Suspense } from 'react'

import { routeTree } from '@/web/routeTree.gen'

import { TestQueryClients } from './query-clients'
import { render, userEvent } from './testing-library'

export function mountApp(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, throwOnError: false },
    },
  })

  TestQueryClients.add(queryClient)

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    context: { queryClient },
  })

  const user = userEvent.setup()

  render(
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>
        <RouterProvider router={router} />
      </Suspense>
    </QueryClientProvider>
  )

  return { user, queryClient, router }
}
