import type { QueryClient } from '@tanstack/react-query'

const queryClients = new Set<QueryClient>()

export const TestQueryClients = {
  add(queryClient: QueryClient) {
    queryClients.add(queryClient)
  },

  clear() {
    for (const queryClient of queryClients) {
      queryClient.clear()
    }

    queryClients.clear()
  },
}
