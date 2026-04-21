import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/media/$id')({
  component: () => <Outlet />,
})
