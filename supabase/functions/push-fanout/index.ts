import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  try {
    const { record } = await req.json();
    if (!record?.id) return json({ ok: false, error: "missing record.id" }, 400);

    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    const contact = Deno.env.get("NOTIFY_EMAIL") || Deno.env.get("GMAIL_USER") || "budgetapp@example.com";
    if (!publicKey || !privateKey) return json({ ok: false, error: "push not configured" }, 500);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: r, error: rErr } = await sb
      .from("reimbursement_requests")
      .select("id,amount,category,merchant,requester_id")
      .eq("id", record.id)
      .single();
    if (rErr || !r) return json({ ok: false, error: "request not found" }, 404);

    const { data: requester } = await sb
      .from("profiles")
      .select("role,display_name,email")
      .eq("id", r.requester_id)
      .single();
    if (requester?.role === "owner") return json({ ok: true, skipped: "owner request" });

    const { data: owners } = await sb.from("profiles").select("id").eq("role", "owner");
    const ownerIds = ((owners ?? []) as { id: string }[]).map((o) => o.id).filter((id) => id !== r.requester_id);
    if (ownerIds.length === 0) return json({ ok: false, error: "no recipients" }, 404);

    const { data: subs } = await sb
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth,user_id")
      .in("user_id", ownerIds);
    const list = (subs ?? []) as { endpoint: string; p256dh: string; auth: string }[];
    if (list.length === 0) return json({ ok: true, sent: 0, reason: "no subscriptions" });

    webpush.setVapidDetails(`mailto:${contact}`, publicKey, privateKey);

    const who = requester?.display_name || requester?.email || "A member";
    const amount = `Rp ${Number(r.amount).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const payload = JSON.stringify({
      title: `New request: ${r.merchant ?? r.category} — ${amount}`,
      body: `${who} submitted a reimbursement request. / ${who} mengajukan permintaan reimbursement.`,
      url: `/requests/${r.id}`,
    });

    let sent = 0;
    const errors: string[] = [];
    for (const s of list) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
        sent++;
      } catch (e) {
        const err = e as Error;
        errors.push(err?.message ?? String(e));
        // Prune dead subscriptions so future fan-outs stay fast.
        if (/410|404|expired|invalid/i.test(err?.message ?? "")) {
          await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }
    }
    return json({ ok: true, sent, total: list.length, errors: errors.slice(0, 5) });
  } catch (e) {
    const err = e as Error;
    return json({ ok: false, error: err?.message ?? String(e) }, 500);
  }
});
