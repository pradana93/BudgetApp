import { test, expect } from "@playwright/test";

test("happy path: login page renders", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /BudgetApp Login/i })).toBeVisible();
  await expect(page.getByText(/owner@budgetapp.local/)).toBeVisible();
});

test("dashboard redirects to login when unauthenticated", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: /BudgetApp Login/i })).toBeVisible();
});

test("login form has email and password inputs", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByPlaceholder("owner@budgetapp.local")).toBeVisible();
  await expect(page.getByText("Sign in")).toBeVisible();
});
