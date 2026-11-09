import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validarRaid } from '@/lib/ingest/esquema';
import { resumenParaIA } from '@/lib/analisis/resumen';
import { analizarRepaso, repasarMuerte, repasoParaIA, type MuerteDato, type RepasoDato } from '@/lib/raids/repaso';

const grupo = ['Jugador1', 'Jugador2', 'Jugador3'];
const repaso = (o: Partial<RepasoDato>): RepasoDato => ({
  vida_10s: 100, vida: [[0, 0]], vida_max: 25000, golpes_10s: 1, dano_10s: 1000, golpes: [{ t: 0, hab: '300', dano: 1000, mit: null }],
  cura_10s: 0, curas: [], escudo_10s: 0, companeros: 2, vivos: 2, sanadores: 1, defensivos: [], ...o,
});
const muerte = (intento: number, t: number, o: Partial<RepasoDato>): MuerteDato & { repaso: RepasoDato } =>
  ({ intento, t, habilidad: '300', origen: 'jefe', golpe_max: 1000, repaso: repaso(o) });

describe('repaso de una muerte', () => {
  it('de un golpe: con la vida alta, un golpe hace casi todo el daño del final', () => {
    const m = repasarMuerte('Jugador1', muerte(1, 50, {
      vida: [[-9.9, 100], [-3.6, 100], [0, 0]],
      golpes: [{ t: -6, hab: '100', dano: 500, mit: null }, { t: 0, hab: '300', dano: 120000, mit: null }],
    }));
    expect(m.tipo).toBe('golpe');
    expect(m.vidaAntes).toBe(100);
    expect(m.curva).toEqual([[-10, 100], [0, 0]]); // sin lecturas repetidas
  });

  it('de un golpe también con la vida baja, si el golpe quita casi toda la vida máxima', () => {
    const m = repasarMuerte('Jugador1', muerte(1, 50, { vida: [[-4, 40], [0, 0]], golpes: [{ t: 0, hab: '300', dano: 174480, mit: null }] }));
    expect(m.tipo).toBe('golpe');
    expect(m.vidaAntes).toBe(40);
  });

  it('en ráfaga: con la vida alta pero repartido en varios golpes, o bien 3 s antes y bajando', () => {
    const varios = repasarMuerte('Jugador1', muerte(1, 50, {
      vida: [[-2, 90], [0, 0]],
      golpes: [{ t: -1, hab: '100', dano: 9000, mit: null }, { t: -0.5, hab: '100', dano: 9000, mit: null }, { t: 0, hab: '300', dano: 9000, mit: null }],
    }));
    expect(varios.tipo).toBe('rafaga');
    const bajando = repasarMuerte('Jugador1', muerte(1, 50, { vida_10s: 95, vida: [[-4, 80], [-1.8, 57], [-1.5, 47], [0, 0]] }));
    expect(bajando.tipo).toBe('rafaga');
    expect(bajando.vida3s).toBe(80);
    expect(bajando.vidaAntes).toBe(47);
  });

  it('por desgaste: llevaba 3 s o más con la vida baja', () => {
    const m = repasarMuerte('Jugador1', muerte(1, 50, { vida_10s: 40, vida: [[-8, 30], [-5, 35], [-2, 20], [0, 0]] }));
    expect(m.tipo).toBe('desgaste');
    expect(m.vida3s).toBe(35);
  });

  it('un defensivo cuenta como libre si pasó su recarga o no se usó, y nunca en una muerte de un golpe', () => {
    const defensivos = [
      { hab: '15160000', hace_s: 22.1, recarga_s: 19.7 },   // pasó la recarga
      { hab: '15170000', hace_s: 5, recarga_s: 19.7 },      // en recarga
      { hab: '15180000', hace_s: null, recarga_s: 60 },     // sin usar en el intento
      { hab: '15190000', hace_s: null, recarga_s: null },   // recarga desconocida: no se afirma nada
    ];
    const lenta = repasarMuerte('Jugador1', muerte(1, 50, { vida_10s: 30, vida: [[-5, 20], [0, 0]], defensivos }));
    expect(lenta.libres).toEqual(['15160000', '15180000']);
    const golpe = repasarMuerte('Jugador1', muerte(1, 50, { defensivos }));
    expect(golpe.tipo).toBe('golpe');
    expect(golpe.libres).toEqual([]);
  });

  it('marca las muertes sin sanador vivo y con más de la mitad de los compañeros caídos', () => {
    expect(repasarMuerte('Jugador1', muerte(1, 50, { companeros: 9, vivos: 4, sanadores: 0 }))).toMatchObject({ sinSanador: true, grupoCaido: true });
    expect(repasarMuerte('Jugador1', muerte(1, 50, { companeros: 9, vivos: 5, sanadores: 1 }))).toMatchObject({ sinSanador: false, grupoCaido: false });
  });
});

describe('repaso de la raid', () => {
  const muertesDe: Record<string, MuerteDato[]> = {
    Jugador1: [muerte(1, 60, { vivos: 1 }), muerte(2, 30, { vida_10s: 30, vida: [[-5, 20], [0, 0]], sanadores: 0 })],
    Jugador2: [muerte(1, 60, { vivos: 2 }), { intento: 2, t: 10, habilidad: '300', golpe_max: 5 }],   // la última, sin repaso
    Intruso: [muerte(1, 5, {})],
  };
  const a = analizarRepaso(muertesDe, grupo);

  it('cuenta por grupo y por jugador, solo del grupo y solo las muertes con repaso', () => {
    expect(a.total).toBe(4);
    expect(a.conRepaso).toBe(3);
    expect(a.grupo).toMatchObject({ muertes: 3, golpe: 2, rafaga: 0, desgaste: 1, sinSanador: 1 });
    expect(a.jugadores.map((j) => [j.jugador, j.muertes])).toEqual([['Jugador1', 2], ['Jugador2', 1]]);
  });

  it('ordena cada intento por segundo y, a igualdad, antes quien tenía más compañeros vivos', () => {
    expect(a.intentos.map((i) => i.intento)).toEqual([1, 2]);
    expect(a.intentos[0].muertes.map((m) => m.jugador)).toEqual(['Jugador2', 'Jugador1']);
  });

  it('da a la IA las cuentas y la primera muerte de cada intento', () => {
    const ia = repasoParaIA(a);
    expect(ia.grupo).toMatchObject({ muertes: 3, de_un_golpe: 2, por_desgaste: 1, sin_sanador_vivo: 1 });
    expect(ia.primera_muerte_de_cada_intento).toEqual([
      expect.objectContaining({ intento: 1, jugador: 'Jugador2', tipo: 'de un golpe' }),
      expect.objectContaining({ intento: 2, jugador: 'Jugador1', tipo: 'por desgaste' }),
    ]);
  });
});

describe('repaso en el fixture anónimo', () => {
  const d = JSON.parse(readFileSync('tests/fixtures/raid-v2-anonima.json', 'utf8'));

  it('el esquema acepta el repaso y rechaza uno incoherente', () => {
    expect(validarRaid(d).ok).toBe(true);
    const mal = structuredClone(d);
    mal.detalle.Jugador5.muertes[0].repaso.curas[0].jugador = 'Intruso';
    expect(validarRaid(mal).ok).toBe(false);
    const mas = structuredClone(d);
    mas.detalle.Jugador5.muertes[0].repaso.vivos = 9;
    expect(validarRaid(mas).ok).toBe(false);
  });

  it('clasifica sus dos muertes', () => {
    const muertesDe = Object.fromEntries(Object.entries(d.detalle).map(([n, x]) => [n, (x as { muertes: MuerteDato[] }).muertes]));
    const a = analizarRepaso(muertesDe, d.meta.grupo);
    expect(a.grupo).toMatchObject({ muertes: 2, golpe: 0, rafaga: 1, desgaste: 1, conDefensivo: 1 });
  });

  it('a la IA le llegan las cuentas, no el repaso en crudo', () => {
    const r = resumenParaIA(d, { apodos: {}, habilidades: {}, npcs: {} }, []);
    expect(r.repaso_de_muertes?.grupo.muertes).toBe(2);
    const muertes = (r.raid.detalle as Record<string, { muertes: object[] }>).Jugador5.muertes;
    expect(muertes).toHaveLength(1);
    expect(muertes[0]).not.toHaveProperty('repaso');
    expect(muertes[0]).toHaveProperty('vida_5s');
  });
});
