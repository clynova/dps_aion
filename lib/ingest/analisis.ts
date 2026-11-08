// Formato del análisis de una raid (lo que hoy es raids/<slug>/analisis.json y analisis.en.json; ver CLAUDE.md).
import { z } from 'zod';

const texto = z.string().max(4000);
export const esquemaAnalisis = z.object({
  pendiente: z.boolean(),
  titular: texto,
  /** Umbral de «mata de un golpe» que usa la página de la raid (por defecto 100000) */
  one_shot: z.number().int().positive().optional(),
  zonas: z.object({ muro: z.tuple([z.number(), z.number()]).optional(), ventana: z.tuple([z.number(), z.number()]).optional() }).strict().nullable().optional(),
  recomendaciones: z.array(z.object({ titulo: texto, texto }).strict()).max(30),
  jugadores: z.record(z.string().max(64), z.array(texto).max(10)).optional(),
  notas: z.array(z.object({ termino: texto, texto }).strict()).max(30).optional(),
}).strict();
export type Analisis = z.infer<typeof esquemaAnalisis>;
