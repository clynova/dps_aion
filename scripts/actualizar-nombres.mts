// Refresca los nombres de questlog.gg en la base de .env.local (la app lo hace sola tras cada subida y a diario).
//   npm run nombres
import { actualizarNombres } from '@/lib/nombres/actualizar';
console.log(await actualizarNombres());
process.exit(0);
