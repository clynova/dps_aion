// Infografías del módulo «Raids»: esquemas en SVG dibujados a mano (components/guia/Infografias.tsx), uno por mecánica
// que hace wipe. Una mecánica de una ficha la cita con `infografia: <id>`; la validación exige que exista.
export const INFOGRAFIAS = ['ludra-tablero', 'rahu-marca', 'rahu-depredadores', 'ketu-piedras'] as const;
export type IdInfografia = (typeof INFOGRAFIAS)[number];
export const esInfografia = (id: string): id is IdInfografia => (INFOGRAFIAS as readonly string[]).includes(id);
