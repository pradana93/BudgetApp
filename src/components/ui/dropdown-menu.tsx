import * as React from "react";
import { cn } from "@/lib/utils";
export function DropdownMenu({ children }: { children: React.ReactNode }){ return <div className="relative inline-block">{children}</div>; }
export function DropdownMenuTrigger({ children, onClick }: { children: React.ReactNode; onClick?:()=>void }){ return <div onClick={onClick}>{children}</div>; }
export function DropdownMenuContent({ className, children }: React.HTMLAttributes<HTMLDivElement>){ return <div className={cn("absolute right-0 mt-2 w-56 rounded-md border bg-popover p-1 shadow-md z-50", className)}>{children}</div>; }
export function DropdownMenuItem({ className, children, onClick }: React.HTMLAttributes<HTMLDivElement> & { onClick?:()=>void }){ return <div onClick={onClick} className={cn("relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent", className)}>{children}</div>; }
