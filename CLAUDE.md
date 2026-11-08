# DPS Aion

Static site (Vercel, https://dpsaion.vercel.app/) with the raid history of Cry's group in Aion 2, built from the Questlog desktop app's combat meter. The user writes in Spanish; commit messages are in Spanish. The site is bilingual (es/en): `assets/i18n.js` holds every UI string in both languages (`data-i18n` attributes in HTML, `I18N.t()` in JS) and the ES | EN toggle; never hardcode UI text in `raid.js` / `home.js`.

## Layout

- `index.html` + `assets/home.js` — home: list of raids from `raids/index.json`, best attempt per boss over time.
- `raids/<slug>/` — one folder per raid: `index.html` (copy of `assets/raid-shell.html`), `data.json` (stats), `analisis.json` (Claude's text).
- `assets/raid.js` — renders a raid page from `data.json`, the analysis and the names for the current language (`analisis.json` / `analisis.en.json`, `nombres.json` / `nombres.en.json`). Clicking a player opens their card (ficha) with skill icons from cdn.questlog.gg.
- `nombres.json` (es) and `nombres.en.json` (en) — names for skill and NPC ids, filled by `tools/actualizar-nombres.ps1 -Idioma es|en` from questlog.gg, plus `iconos` (icon paths) (`combatLog.entities.skills` / `.names`, the same source as the Questlog app). `habilidades` and `npcs` are regenerated; `apodos` are hand-written labels that win over them (most boss attacks are just "Ataque" in game data, so they show as "Ataque <id>" unless they have an apodo). NPCs named `N_Invisible_Summon_*` are invisible damage zones spawned by boss skills, not adds: they show as "Zona 8-2" etc.
- `tools/extraer-raid.ps1` — reads `%APPDATA%\Questlog\aion-2` (runs, encounters `*.json.gz`) and writes the raid folder plus the index entry. `-Lista` shows recent runs, `-Run <id prefix>` picks one. Must stay UTF-8 with BOM (Windows PowerShell 5.1).
- `jugadores/<slug>/` — one profile per player across all published raids: `data.json` (built by `tools/perfiles.ps1`, which `extraer-raid.ps1` runs after every extraction or `-Reindexar`), `index.html` (copy of `assets/jugador-shell.html`) and `perfil.json` / `perfil.en.json` (Claude's written profile: `actualizado`, `raids`, `resumen`, `fortalezas`, `mejorar`, `recomendaciones`). `assets/jugador.js` also computes an automatic profile from the numbers.
- `nueva-raid.bat` — the user's button: pull, extract the latest raid, refresh names, commit, push. Vercel deploys on push.

## "Analiza la última raid"

1. If the newest run in Questlog is not in `raids/index.json` yet, run `tools/extraer-raid.ps1` (or ask the user to press `nueva-raid.bat`).
2. Read `raids/<slug>/data.json`. Look at: progress per attempt and where attempts stall (`curva`), what kills people (`causas`, one-shots are `golpe_max` >= 100000), the boss cast timeline (`casteos`), stagger breaks (`intentos.rotura_s`), each player's numbers and `detalle` (skills, damage taken, deaths). Compare with earlier raids of the same boss in `raids/index.json` when there are any.
3. Write `raids/<slug>/analisis.json`:

```json
{
  "pendiente": false,
  "titular": "One or two sentences with the takeaway; **bold** is allowed.",
  "zonas": { "muro": [35, 50], "ventana": [140, 175] },
  "recomendaciones": [{ "titulo": "Short imperative.", "texto": "Why, with the evidence from the data." }],
  "jugadores": { "PlayerName": ["Personal recommendation backed by their numbers."] },
  "notas": [{ "termino": "Label", "texto": "Extra caveat about this raid." }]
}
```

   `zonas` is optional (bands on the charts: `muro` = % of boss HP, `ventana` = seconds). Give every player in `meta.grupo` at least one recommendation, based on their own data (deaths and what caused them, DPS vs the group, skill mix, damage taken), constructive and specific.
4. Write the same analysis in English to `raids/<slug>/analisis.en.json` (same structure, translated text, same ids and numbers). Without it the English page shows the Spanish text with a notice.
5. Rebuild the index and player profiles (`tools/extraer-raid.ps1 -Reindexar`).
6. Update `jugadores/<slug>/perfil.json` and `perfil.en.json` for every player in the raid with what the new night adds (trends versus their earlier raids, recurring causes of death), keeping it short and backed by `jugadores/<slug>/data.json`. Do not assume anyone's gender. Commit and push.

In analysis text, write skill and NPC ids as bare numbers (e.g. 1802880): the page replaces them with «name» from `nombres.json`, titles included. Facts must come from the data files; say so when something is an inference (for example, players who left mid-run).
