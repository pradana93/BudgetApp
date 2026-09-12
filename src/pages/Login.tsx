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
import { loginSchema, type LoginForm } from "@/schemas/auth";

export default function Login() {
  const { toast } = useToast();
  const nav = useNavigate();
  const { session } = useSession();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
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
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Signed in", description: values.email.trim() });
      nav("/");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>BudgetApp Login</CardTitle>
          <CardDescription>Email + password (owner/member). Supabase Auth.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" placeholder="owner@budgetapp.local" {...register("email")} />
              {errors.email && <p className="text-sm text-destructive mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
              {errors.password && <p className="text-sm text-destructive mt-1">{errors.password.message}</p>}
            </div>
            {serverError && <p className="text-sm text-destructive">{serverError}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              No account yet?{" "}
              <Link to="/register" className="text-primary underline">
                Create account
              </Link>
            </p>
            <p className="text-xs text-muted-foreground">
              Seed accounts: <b>owner@budgetapp.local</b> / <b>member@budgetapp.local</b> — password you set. See docs/REPORT.md for invite flow.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
