export function MissingEnv() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 560 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Configuration missing</h1>
        <p style={{ marginTop: 8, fontSize: 14, opacity: 0.8 }}>
          VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set. The app cannot connect to the database.
          Set both in the Vercel dashboard under Settings → Environment Variables (and in .env.local for local dev), then redeploy.
        </p>
      </div>
    </div>
  );
}
