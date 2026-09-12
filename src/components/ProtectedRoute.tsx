import { Navigate } from "react-router-dom";
import { useSession } from "@/hooks/useSession";

export function ProtectedRoute({ children, ownerOnly }: { children: React.ReactNode; ownerOnly?: boolean }) {
  const { session, profile, loading } = useSession();
  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (ownerOnly && profile?.role !== "owner") return <Navigate to="/" replace />;
  return <>{children}</>;
}
