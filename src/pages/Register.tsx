import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/lib/supabase";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/hooks/useSession";
import { useLang } from "@/i18n/LanguageContext";
import { AuthBrand } from "@/components/AuthBrand";
import { getRegisterSchema, type RegisterForm } from "@/schemas/auth";

export default function Register() {
  const { toast } = useToast();
  const { t } = useLang();
  const nav = useNavigate();
  const { session } = useSession();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const schema = React.useMemo(
    () => getRegisterSchema({
      emailRequired: t("v.emailRequired"),
      emailInvalid: t("v.emailInvalid"),
      nameRequired: t("v.nameRequired"),
      passwordMin: t("v.passwordMin"),
      confirmRequired: t("v.confirmRequired"),
      passwordsMismatch: t("v.passwordsMismatch"),
    }),
    [t]
  );
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterForm>({
    resolver: zodResolver(schema),
    defaultValues: { display_name: "", email: "", password: "", confirmPassword: "" },
  });

  React.useEffect(() => {
    if (session) nav("/", { replace: true });
  }, [session, nav]);

  const onSubmit = async (values: RegisterForm) => {
    setServerError(null);
    const { data, error } = await supabase.auth.signUp({
      email: values.email.trim(),
      password: values.password,
      options: { data: { display_name: values.display_name.trim() } },
    });
    if (error) {
      setServerError(error.message);
      toast({ title: t("register.failed"), description: error.message, variant: "destructive" });
      return;
    }
    // If email confirmation is OFF, Supabase returns a session immediately.
    if (data.session) {
      toast({ title: t("register.created"), description: t("register.signedInNow") });
      nav("/");
    } else {
      setDone(true);
      toast({ title: t("register.checkEmail"), description: t("register.checkEmailDesc") });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500/10 via-background to-violet-500/10 p-4">
      <Card className="w-full max-w-3xl overflow-hidden md:grid md:grid-cols-[1fr_1.15fr] animate-pop">
        <AuthBrand />
        <div className="p-6 md:p-8">
          {done ? (
            <div className="space-y-4">
              <CardTitle className="text-2xl">{t("register.checkTitle")}</CardTitle>
              <CardDescription>{t("register.checkDesc")}</CardDescription>
              <p className="text-sm text-muted-foreground">
                {t("register.roleA")} <b>owner@budgetapp.local</b> {t("register.roleB")} <code>handle_new_user()</code> {t("register.roleC")}
              </p>
              <Link to="/login">
                <Button className="w-full">{t("register.goLogin")}</Button>
              </Link>
            </div>
          ) : (
            <>
              <CardTitle className="text-2xl">{t("register.title")}</CardTitle>
              <CardDescription className="mt-1">{t("register.desc")}</CardDescription>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-6" noValidate>
                <div>
                  <Label htmlFor="display_name">{t("register.name")}</Label>
                  <Input id="display_name" autoComplete="name" placeholder={t("register.namePh")} {...register("display_name")} />
                  {errors.display_name && <p className="text-sm text-destructive mt-1">{errors.display_name.message}</p>}
                </div>
                <div>
                  <Label htmlFor="email">{t("register.email")}</Label>
                  <Input id="email" type="email" autoComplete="email" placeholder={t("register.emailPh")} {...register("email")} />
                  {errors.email && <p className="text-sm text-destructive mt-1">{errors.email.message}</p>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="password">{t("register.password")}</Label>
                    <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
                    {errors.password && <p className="text-sm text-destructive mt-1">{errors.password.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="confirmPassword">{t("register.confirm")}</Label>
                    <Input id="confirmPassword" type="password" autoComplete="new-password" {...register("confirmPassword")} />
                    {errors.confirmPassword && <p className="text-sm text-destructive mt-1">{errors.confirmPassword.message}</p>}
                  </div>
                </div>
                {serverError && <p className="text-sm text-destructive">{serverError}</p>}
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? t("register.creating") : t("register.submit")}
                </Button>
                <p className="text-sm text-center text-muted-foreground">
                  {t("register.haveAccount")}{" "}
                  <Link to="/login" className="text-primary underline">
                    {t("register.signIn")}
                  </Link>
                </p>
              </form>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
