import { z } from "zod";

export type AuthMessages = {
  emailRequired?: string;
  emailInvalid?: string;
  passwordRequired?: string;
  nameRequired?: string;
  passwordMin?: string;
  confirmRequired?: string;
  passwordsMismatch?: string;
};

const fb = (v: string | undefined, fallback: string) => v ?? fallback;

export function getLoginSchema(m: AuthMessages = {}) {
  return z.object({
    email: z.string().min(1, fb(m.emailRequired, "Email required")).email(fb(m.emailInvalid, "Invalid email")),
    password: z.string().min(1, fb(m.passwordRequired, "Password required")),
  });
}

export const loginSchema = getLoginSchema();
export type LoginForm = z.infer<typeof loginSchema>;

export function getRegisterSchema(m: AuthMessages = {}) {
  return z
    .object({
      display_name: z.string().min(1, fb(m.nameRequired, "Name required")).max(100),
      email: z.string().min(1, fb(m.emailRequired, "Email required")).email(fb(m.emailInvalid, "Invalid email")),
      password: z.string().min(8, fb(m.passwordMin, "Password must be at least 8 characters")).max(128),
      confirmPassword: z.string().min(1, fb(m.confirmRequired, "Please confirm your password")),
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: fb(m.passwordsMismatch, "Passwords do not match"),
      path: ["confirmPassword"],
    });
}

export const registerSchema = getRegisterSchema();
export type RegisterForm = z.infer<typeof registerSchema>;
