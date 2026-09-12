import * as React from "react";
import { cn } from "@/lib/utils";
export function Avatar({ className, ...p }: React.HTMLAttributes<HTMLDivElement>){ return <div className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted", className)} {...p} />; }
export function AvatarFallback({ className, ...p }: React.HTMLAttributes<HTMLDivElement>){ return <div className={cn("flex h-full w-full items-center justify-center rounded-full bg-muted text-sm", className)} {...p} />; }
