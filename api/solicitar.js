// Función de Vercel: el botón «Solicitar análisis» de la portada hace POST { slug } aquí y esto avisa en Discord.
// El webhook vive en la variable de entorno DISCORD_WEBHOOK_URL (Vercel → Settings → Environment Variables), nunca en la web.
// Solo acepta jugadores que existen en jugadores/index.json, así que el mensaje no lleva texto escrito por quien lo pide.
const recientes = new Map(); // slug → hora del último aviso (por instancia; frena repeticiones seguidas)
const ESPERA_MS = 10 * 60 * 1000;

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method' }); }
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return res.status(503).json({ error: 'sin-configurar' });

  const slug = String((req.body && req.body.slug) || '');
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return res.status(400).json({ error: 'slug' });

  const origen = `https://${req.headers.host}`;
  let jugadores;
  try { jugadores = await fetch(`${origen}/jugadores/index.json`).then((r) => r.json()); }
  catch (e) { return res.status(502).json({ error: 'indice' }); }
  const p = jugadores.find((j) => j.slug === slug);
  if (!p) return res.status(404).json({ error: 'jugador' });

  const ahora = Date.now();
  if (ahora - (recientes.get(slug) || 0) < ESPERA_MS) return res.status(200).json({ ok: true, repetida: true });
  recientes.set(slug, ahora);

  const k = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + 'k' : String(n));
  const lineas = [
    `📊 **${p.nombre}** pide el análisis de su perfil`,
    `${p.raids} raids (${p.kills} con kill) · DPS medio ${k(p.dps_medio)} · HPS medio ${k(p.hps_medio)} · ${String(p.muertes_intento).replace('.', ',')} muertes por intento · GS ${p.gs}`,
    `Última raid: ${p.ultima.slice(0, 10)} · Perfil escrito por Claude: ${p.perfil ? 'sí' : 'todavía no'}`,
    `${origen}/jugadores/${p.slug}/`,
  ];
  const r = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'DPS Aion', content: lineas.join('\n'), allowed_mentions: { parse: [] } }),
  }).catch(() => null);
  if (!r || !r.ok) { recientes.delete(slug); return res.status(502).json({ error: 'discord' }); }
  return res.status(200).json({ ok: true });
};
