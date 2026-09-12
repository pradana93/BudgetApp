import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().min(1, "Email required").email("Invalid email"),
  password: z.string().min(1, "Password required"),
});

export type LoginForm = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    display_name: z.string().min(1, "Name required").max(100),
    email: z.string().min(1, "Email required").email("Invalid email"),
    password: z.string().min(8, "Password must be at least 8 characters").max(128),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type RegisterForm = z.infer<typeof registerSchema>;
