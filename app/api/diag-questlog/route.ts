// TEMPORAL: comprueba si questlog.gg responde desde Vercel. Se borra tras el diagnóstico.
export const dynamic = 'force-dynamic';
export async function GET() {
  const out: unknown[] = [];
  for (const p of ['combatLog.entities.skills', 'combatLog.entities.names']) {
    const t = Date.now();
    try {
      const r = await fetch(`https://questlog.gg/aion-2/api/trpc/${p}?input=${encodeURIComponent('{"language":"es"}')}`, { cache: 'no-store', signal: AbortSignal.timeout(60_000) });
      const txt = await r.text();
      out.push({ p, status: r.status, bytes: txt.length, ms: Date.now() - t, server: r.headers.get('server'), cf: r.headers.get('cf-mitigated'), inicio: txt.slice(0, 200) });
    } catch (e) { out.push({ p, error: String(e), ms: Date.now() - t }); }
  }
  return Response.json(out);
}
