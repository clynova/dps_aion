// Aplica la semilla de nombres del repo (nombres.json / nombres.en.json): apodos globales y nombres que falten.
// Se ejecuta en cada despliegue (build:vercel), porque Vercel no puede bajar los nombres de questlog.gg.
//   node --conditions=react-server --import tsx scripts/semilla-nombres.mts
import { aplicarSemilla } from '@/lib/nombres/actualizar';
if (!process.env.DATABASE_URL) { console.log('semilla de nombres: sin DATABASE_URL, se omite'); process.exit(0); }
console.log('semilla de nombres:', await aplicarSemilla());
process.exit(0);
