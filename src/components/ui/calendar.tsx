"use client"

import * as React from "react"
import { DayPicker } from "react-day-picker"
import { cn } from "@/lib/utils"

function Calendar({
    className,
    classNames,
    showOutsideDays = true,
    ...props
}: React.ComponentProps<typeof DayPicker>) {
    return (
        <DayPicker
            showOutsideDays={showOutsideDays}
            className={cn("p-3", className)}
            classNames={{
                root: cn("w-fit", classNames?.root),
                chevron: "size-4 fill-current",
                month: "flex flex-col gap-4",
                months: "flex flex-col sm:flex-row gap-2",
                month_caption: "flex justify-center pt-1 relative items-center w-full",
                caption_label: "text-sm font-medium",
                nav: "flex items-center gap-1",
                button_previous: "absolute left-1 inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent transition-colors",
                button_next: "absolute right-1 inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent transition-colors",
                month_grid: "w-full border-collapse",
                weekdays: "flex",
                weekday: "text-muted-foreground rounded-md w-8 font-normal text-xs",
                week: "flex w-full mt-2",
                day: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent rounded-md",
                day_button: "inline-flex items-center justify-center rounded-md p-0 w-8 h-8 text-sm font-normal transition-colors hover:bg-accent hover:text-accent-foreground aria-selected:bg-primary aria-selected:text-primary-foreground",
                selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                today: "bg-accent text-accent-foreground",
                outside: "text-muted-foreground opacity-50",
                disabled: "text-muted-foreground opacity-50 pointer-events-none",
                hidden: "invisible",
                ...classNames,
            }}
            {...props}
        />
    )
}

export { Calendar }
