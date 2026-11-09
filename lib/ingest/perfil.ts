// Perfil escrito por Claude (lo que era jugadores/<slug>/perfil.json y perfil.en.json).
import { z } from 'zod';

const textos = z.array(z.string().min(1).max(2000)).max(12);

export const esquemaPerfil = z.strictObject({
  actualizado: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  raids: z.number().int().min(0),
  resumen: z.string().min(1).max(4000),
  fortalezas: textos,
  mejorar: textos,
  recomendaciones: textos,
});
export type PerfilTexto = z.infer<typeof esquemaPerfil>;
