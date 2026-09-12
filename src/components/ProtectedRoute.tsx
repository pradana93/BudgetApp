import { Navigate } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { useLang } from "@/i18n/LanguageContext";

export function ProtectedRoute({ children, ownerOnly }: { children: React.ReactNode; ownerOnly?: boolean }) {
  const { session, profile, loading } = useSession();
  const { t } = useLang();
  if (loading) return <div className="p-8 text-sm text-muted-foreground">{t("common.loading")}</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (ownerOnly && profile?.role !== "owner") return <Navigate to="/" replace />;
  return <>{children}</>;
}
