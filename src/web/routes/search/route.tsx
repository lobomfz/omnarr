import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/search')({
  component: () => <Outlet />,
})
