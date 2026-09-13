import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import nodemailer from "npm:nodemailer@6.9.14";

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

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: r, error: rErr } = await sb
      .from("reimbursement_requests")
      .select("id,amount,category,merchant,description,due_date,requester_id,created_at")
      .eq("id", record.id)
      .single();
    if (rErr || !r) return json({ ok: false, error: "request not found" }, 404);

    const { data: requester } = await sb
      .from("profiles")
      .select("email,display_name,role")
      .eq("id", r.requester_id)
      .single();
    // Owner-created requests need no email (the owner already knows)
    if (requester?.role === "owner") return json({ ok: true, skipped: "owner request" });

    const { data: owners } = await sb.from("profiles").select("email").eq("role", "owner");
    const profileEmails = ((owners ?? []) as { email: string }[]).map((o) => o.email).filter(Boolean);
    // NOTIFY_EMAIL override: seed/demo owner identities like owner@budgetapp.local
    // are not real mailboxes, so ops can direct owner mail to a real inbox.
    const override = Deno.env.get("NOTIFY_EMAIL") ?? "";
    const to = override ? [override] : profileEmails;
    if (to.length === 0) return json({ ok: false, error: "no recipients" }, 404);

    const gmailUser = Deno.env.get("GMAIL_USER") ?? "";
    const gmailPass = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
    if (!gmailUser || !gmailPass) return json({ ok: false, error: "email not configured" }, 500);

    const amount = `Rp ${Number(r.amount).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const who = requester?.display_name || requester?.email || "A member";
    const title = `${r.merchant ?? r.category} — ${amount}`;
    const subject = `New request: ${title}`;
    const text = [
      `${who} submitted a new reimbursement request.`,
      ``,
      `Merchant: ${r.merchant ?? "-"}`,
      `Amount: ${amount}`,
      `Category: ${r.category}`,
      r.description ? `Note: ${r.description}` : null,
      r.due_date ? `Due: ${r.due_date}` : null,
      ``,
      `---`,
      ``,
      `${who} mengajukan permintaan reimbursement baru.`,
      ``,
      `Merchant: ${r.merchant ?? "-"}`,
      `Nominal: ${amount}`,
      `Kategori: ${r.category}`,
    ].filter((line): line is string => line !== null).join("\n");

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });
    const info = await transporter.sendMail({
      from: `"BudgetApp" <${gmailUser}>`,
      to: to.join(", "),
      subject,
      text,
    });
    return json({ ok: true, messageId: info.messageId, to });
  } catch (e) {
    const err = e as Error;
    return json({ ok: false, error: err?.message ?? String(e) }, 500);
  }
});
