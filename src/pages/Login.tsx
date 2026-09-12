import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/hooks/useSession";
import { useLang } from "@/i18n/LanguageContext";
import { getLoginSchema, type LoginForm } from "@/schemas/auth";

export default function Login() {
  const { toast } = useToast();
  const { t } = useLang();
  const nav = useNavigate();
  const { session } = useSession();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const schema = React.useMemo(
    () => getLoginSchema({ emailRequired: t("v.emailRequired"), emailInvalid: t("v.emailInvalid"), passwordRequired: t("v.passwordRequired") }),
    [t]
  );
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: { email: "owner@budgetapp.local", password: "password123" },
  });

  React.useEffect(() => {
    if (session) nav("/", { replace: true });
  }, [session, nav]);

  const onSubmit = async (values: LoginForm) => {
    setServerError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email.trim(),
      password: values.password,
    });
    if (error) {
      setServerError(error.message);
      toast({ title: t("login.failed"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("login.signedIn"), description: values.email.trim() });
      nav("/");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("login.title")}</CardTitle>
          <CardDescription>{t("login.desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div>
              <Label htmlFor="email">{t("login.email")}</Label>
              <Input id="email" type="email" autoComplete="email" placeholder="owner@budgetapp.local" {...register("email")} />
              {errors.email && <p className="text-sm text-destructive mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <Label htmlFor="password">{t("login.password")}</Label>
              <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
              {errors.password && <p className="text-sm text-destructive mt-1">{errors.password.message}</p>}
            </div>
            {serverError && <p className="text-sm text-destructive">{serverError}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? t("login.signingIn") : t("login.submit")}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              {t("login.noAccount")}{" "}
              <Link to="/register" className="text-primary underline">
                {t("login.createAccount")}
              </Link>
            </p>
            <p className="text-xs text-muted-foreground">
              {t("login.seedA")} <b>owner@budgetapp.local</b> / <b>member@budgetapp.local</b> {t("login.seedB")}
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
