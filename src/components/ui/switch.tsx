import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer relative box-border inline-flex h-6 w-11 shrink-0 overflow-hidden rounded-full border border-transparent bg-input shadow-xs transition-[background-color,box-shadow] outline-none data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 dark:data-[state=unchecked]:bg-input/80",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none absolute top-1/2 left-0.5 block size-5 -translate-y-1/2 rounded-full bg-background shadow-sm ring-0 transition-transform duration-200 data-[state=checked]:translate-x-5 data-[state=checked]:-translate-y-1/2 data-[state=unchecked]:translate-x-0 data-[state=unchecked]:-translate-y-1/2 dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
