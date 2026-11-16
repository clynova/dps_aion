// Formato de la pestaña «Sin filtro» de una raid (docs/plan-toxico.md): solo lo malo de cada jugador y una mejora.
import { z } from 'zod';

const texto = z.string().max(1500);
export const esquemaToxico = z.object({
  titular: texto,
  /** Por jugador: de 1 a 4 pullas (pocas si no hay nada que destacar) y cómo dejar de hacerlo */
  jugadores: z.record(z.string().max(64), z.object({ pullas: z.array(texto).min(1).max(4), mejora: texto }).strict()),
  notas: z.array(z.object({ termino: texto, texto }).strict()).max(10).optional(),
}).strict();
export type Toxico = z.infer<typeof esquemaToxico>;
