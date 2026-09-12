import * as React from "react";
import { cn } from "@/lib/utils";
export function Dialog({ open, onOpenChange, children }: { open: boolean; onOpenChange:(o:boolean)=>void; children: React.ReactNode }){
  if(!open) return null;
  return <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
    <div className="fixed inset-0 bg-black/50 animate-fade-up" onClick={()=>onOpenChange(false)} />
    <div className="mobile-sheet relative bg-background rounded-t-2xl sm:rounded-lg shadow-xl w-full sm:max-w-lg sm:mx-4 max-h-[92vh] sm:max-h-[90vh] overflow-auto animate-pop">{children}</div>
  </div>;
}
export function DialogHeader({ className, ...p }: React.HTMLAttributes<HTMLDivElement>){ return <div className={cn("flex flex-col space-y-1.5 p-6 pb-2", className)} {...p} />; }
export function DialogTitle({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>){ return <h3 className={cn("text-lg font-semibold", className)} {...p} />; }
export function DialogDescription({ className, ...p }: React.HTMLAttributes<HTMLParagraphElement>){ return <p className={cn("text-sm text-muted-foreground", className)} {...p} />; }
export function DialogContent({ className, ...p }: React.HTMLAttributes<HTMLDivElement>){ return <div className={cn("p-6 pt-2", className)} {...p} />; }
export function DialogFooter({ className, ...p }: React.HTMLAttributes<HTMLDivElement>){ return <div className={cn("flex justify-end gap-2 p-6 pt-2", className)} {...p} />; }
