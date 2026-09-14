import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const anon = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await anon.auth.getUser();
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);

    // owner check via service role
    const svc = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data: profile } = await svc.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "owner") return json({ ok: false, error: "forbidden: owner only" }, 403);

    const body = await req.json();
    const action = body.action as string;

    if (action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const display_name = String(body.display_name ?? "").trim() || email.split("@")[0];
      const role = body.role === "owner" ? "owner" : "member";
      if (!email || !email.includes("@") || password.length < 8) return json({ ok: false, error: "invalid email/password" }, 400);

      const { data, error } = await svc.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name },
      });
      if (error) return json({ ok: false, error: error.message }, 400);
      const newId = data.user?.id;
      if (newId && role !== "member") {
        // handle_new_user defaults member unless owner email; override
        await svc.from("profiles").update({ display_name, role }).eq("id", newId);
      } else if (newId) {
        await svc.from("profiles").update({ display_name }).eq("id", newId);
      }
      return json({ ok: true, id: newId });
    }

    if (action === "update") {
      const user_id = String(body.user_id ?? "");
      const display_name = body.display_name !== undefined ? String(body.display_name).trim() : undefined;
      const role = body.role as string | undefined;
      if (!user_id) return json({ ok: false, error: "user_id required" }, 400);
      // prevent self-role demotion lockout? allow but warn
      const patch: Record<string, unknown> = {};
      if (display_name !== undefined) patch.display_name = display_name || null;
      if (role === "owner" || role === "member") patch.role = role;
      if (Object.keys(patch).length === 0) return json({ ok: false, error: "nothing to update" }, 400);
      const { error } = await svc.from("profiles").update(patch).eq("id", user_id);
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "delete") {
      const user_id = String(body.user_id ?? "");
      if (!user_id) return json({ ok: false, error: "user_id required" }, 400);
      if (user_id === user.id) return json({ ok: false, error: "cannot delete self" }, 400);
      const { error } = await svc.auth.admin.deleteUser(user_id);
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    const err = e as Error;
    return json({ ok: false, error: err?.message ?? String(e) }, 500);
  }
});
