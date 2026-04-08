import * as PopoverPrimitive from '@radix-ui/react-popover'

import { cn } from '@/web/lib/cn'

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverClose = PopoverPrimitive.Close

export function PopoverContent(props: {
  children: React.ReactNode
  className?: string
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={props.align ?? 'end'}
        sideOffset={props.sideOffset ?? 8}
        className={cn(
          'glass-liquid rounded-xl shadow-2xl shadow-black/60 overflow-hidden z-50',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=open]:fade-in data-[state=closed]:fade-out',
          'duration-200',
          props.className
        )}
      >
        {props.children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  )
}
