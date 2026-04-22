import {
  act,
  cleanup as rtlCleanup,
  render,
  renderHook,
  waitFor,
  fireEvent,
} from '@testing-library/react'

import { TestQueryClients } from './query-clients'

export { act, render, renderHook, waitFor, fireEvent }
export {
  default as userEvent,
  type UserEvent,
} from '@testing-library/user-event'

export function cleanup() {
  act(() => {
    rtlCleanup()
    TestQueryClients.clear()
  })
}
