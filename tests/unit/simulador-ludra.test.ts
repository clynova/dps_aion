import { describe, expect, it } from 'vitest';
import {
  azar, cobertura, escenarioAlAzar, PELIGROS, PRESETS, probarTodas, problemasDelPlan, simular,
  type Celda, type Config, type JugadorPlan, type Parada, type Plan,
} from '@/lib/simulador/ludra';

// Tablero de 3×3, una tanda (marca a 1 s, impacto a 3 s: la ventana de daño va de 2 a 3 s) y golpe final a 8 s.
const base: Config = {
  tamano: 3, velocidad: 2, tandas: [{ aviso: 1, impacto: 3 }], margen: 1, holgura: 0.2, reaccion: 0.5, final: 8,
  alFallar: 'muere', orbes: [], rayoEsquina: null, esquivar: false,
};
const c = (f: number, k: number): Celda => ({ f, k });
const p = (f: number, k: number, salida: Parada['salida'] = 'rayo'): Parada => ({ celda: c(f, k), salida });
const j = (id: string, ...ruta: Parada[]): JugadorPlan => ({ id, nombre: id, ruta });
const plan = (...jugadores: JugadorPlan[]): Plan => ({ jugadores });
const sim = (pl: Plan, segura: Celda | null, config: Config = base) => simular(config, pl, { segura, esquina: 1 });

describe('Prueba de Ludra: rayos y casilla segura', () => {
  it('quien espera el rayo y sale a tiempo no recibe nada y su casilla queda destapada', () => {
    const r = sim(plan(j('A', p(0, 0), p(0, 1, 'pasar'))), null);
    expect(r.eventos.find((e) => e.tipo === 'marca')).toMatchObject({ t: 1, celda: c(0, 0), jugadores: ['A'] });
    expect(r.eventos.find((e) => e.tipo === 'impacto')).toMatchObject({ t: 3, celda: c(0, 0), segura: false });
    // Sin segura destapada, el golpe final lo mata (es lo único que lo mata)
    expect(r.muertos).toEqual([{ jugador: 'A', t: 8, causa: 'final' }]);
  });

  it('quien se queda en una casilla marcada muere al empezar la ventana del último segundo', () => {
    const r = sim(plan(j('A', p(0, 0, 'pasar'))), c(2, 2));
    expect(r.muertos).toEqual([{ jugador: 'A', t: 2, causa: 'rayo' }]);
  });

  it('pasar por una casilla marcada en su último segundo también cuenta', () => {
    // B marca (0,2) y se va; A sale a los 2 s de (0,0) hacia (0,2): cruza (0,1) y entra en (0,2) antes de los 3 s
    const r = sim(plan(j('B', p(0, 2), p(1, 2, 'pasar')), j('A', p(0, 0, { t: 1.6 }), p(0, 2, 'pasar'))), c(2, 2));
    expect(r.muertos.find((m) => m.jugador === 'A')).toMatchObject({ causa: 'rayo' });
    expect(r.muertos.find((m) => m.jugador === 'B')?.causa).toBe('final');
  });

  it('el rayo sobre la segura la destapa y todos llegan a ella antes del final', () => {
    const r = sim(plan(j('A', p(1, 1)), j('B', p(0, 0)), j('C', p(2, 2))), c(1, 1));
    expect(r.destapada).toBe(3);
    expect(r.eventos.filter((e) => e.tipo === 'impacto' && e.segura)).toHaveLength(1);
    expect(r.exito).toBe(true);
    // B y C echan a andar a los 3,5 s; A volvió a la casilla vecina tras esperar el rayo y también vuelve
    for (const id of ['A', 'B', 'C']) expect(r.llegadas[id]).toBeGreaterThan(3.5);
    expect(r.llegadas.B).toBeLessThan(5);
  });

  it('en la segura no hace daño quedarse durante el rayo', () => {
    const r = sim(plan(j('A', p(1, 1, 'pasar'))), c(1, 1));
    expect(r.exito).toBe(true);
    expect(r.destapada).toBe(3);
    expect(r.llegadas.A).toBe(3.5);
  });

  it('con alFallar = marca el rayo deja un golpe y no mata', () => {
    const r = sim(plan(j('A', p(0, 0, 'pasar')), j('S', p(1, 1))), c(1, 1), { ...base, alFallar: 'marca' });
    expect(r.golpes).toEqual([{ jugador: 'A', t: 2, causa: 'rayo' }]);
    expect(r.exito).toBe(true);
  });

  it('un jugador muerto no marca casillas en la tanda siguiente', () => {
    const config = { ...base, tandas: [{ aviso: 1, impacto: 3 }, { aviso: 4, impacto: 6 }] };
    const r = sim(plan(j('A', p(0, 0, 'pasar'))), c(2, 2), config);
    expect(r.eventos.filter((e) => e.tipo === 'marca')).toHaveLength(1);
  });
});

describe('Peligros aparte', () => {
  it('el orbe golpea dentro de su radio', () => {
    const config: Config = { ...base, orbes: [{ id: 'izq', aviso: 0, impacto: 0.5, x: -0.5, y: 1.5, radio: 1.5, efecto: 'golpe' }] };
    const r = sim(plan(j('Cerca', p(1, 0, 'pasar')), j('Lejos', p(1, 2, 'pasar'))), null, config);
    expect(r.golpes).toEqual([{ jugador: 'Cerca', t: 0.5, causa: 'orbe' }]);
  });

  it('el rayo de esquina va de esa esquina a la opuesta', () => {
    const config: Config = { ...base, final: 1, tandas: [], rayoEsquina: { aviso: 0, impacto: 0.5, esquina: 'azar', ancho: 1, efecto: 'muerte' } };
    const pl = plan(j('Diag', p(0, 0, 'pasar')), j('Anti', p(0, 2, 'pasar')), j('Centro', p(1, 1, 'pasar')));
    const r1 = simular(config, pl, { segura: null, esquina: 1 });
    expect(r1.muertos.filter((m) => m.causa === 'rayo-esquina').map((m) => m.jugador).sort()).toEqual(['Centro', 'Diag']);
    const r2 = simular(config, pl, { segura: null, esquina: 3 });
    expect(r2.muertos.filter((m) => m.causa === 'rayo-esquina').map((m) => m.jugador).sort()).toEqual(['Anti', 'Centro']);
  });

  it('con esquivar, quien lo ve a tiempo se aparta y luego vuelve a su parada', () => {
    // Aviso a 0, reacción 0,5 s: se aparta 0,85 casillas a 2 casillas/s y llega a los ~0,95 s, antes del impacto (1,5)
    const config: Config = { ...base, final: 4, tandas: [], esquivar: true, rayoEsquina: { aviso: 0, impacto: 1.5, esquina: 1, ancho: 1, efecto: 'muerte' } };
    const r = simular(config, plan(j('Diag', p(0, 0, 'pasar')), j('Centro', p(1, 1, 'pasar'))), { segura: null, esquina: 1 });
    expect(r.muertos.filter((m) => m.causa === 'rayo-esquina')).toEqual([]);
    const fin = r.fotogramas[r.fotogramas.length - 1].pos;
    expect(fin[0]).toEqual({ x: 0.5, y: 0.5 });
    // Con el aviso demasiado justo (impacto antes de reaccionar) no le da tiempo
    const justo = simular({ ...config, rayoEsquina: { ...config.rayoEsquina!, impacto: 0.5 } }, plan(j('Diag', p(0, 0, 'pasar'))), { segura: null, esquina: 1 });
    expect(justo.muertos[0]).toMatchObject({ causa: 'rayo-esquina' });
  });

  it('con esquivar, quien está fuera no entra en la zona hasta que pasa el golpe', () => {
    // Sale de B1 a los 0,6 s hacia B2, que está en la diagonal: espera fuera hasta el impacto (2 s) y luego sigue
    const config: Config = { ...base, final: 4, tandas: [], esquivar: true, rayoEsquina: { aviso: 0, impacto: 2, esquina: 1, ancho: 1, efecto: 'muerte' } };
    const r = simular(config, plan(j('A', p(0, 1, { t: 0.6 }), p(1, 1, 'pasar'))), { segura: null, esquina: 1 });
    expect(r.muertos.filter((m) => m.causa === 'rayo-esquina')).toEqual([]);
    expect(r.fotogramas[r.fotogramas.length - 1].pos[0]).toEqual({ x: 1.5, y: 1.5 });
    const sin = simular({ ...config, esquivar: false }, plan(j('A', p(0, 1, { t: 0.6 }), p(1, 1, 'pasar'))), { segura: null, esquina: 1 });
    expect(sin.muertos[0]).toMatchObject({ causa: 'rayo-esquina' });
  });

  it('con esquivar, se sale del radio del orbe', () => {
    const config: Config = { ...base, final: 4, tandas: [], esquivar: true, orbes: [{ id: 'izq', aviso: 0, impacto: 2, x: -0.5, y: 1.5, radio: 1.5, efecto: 'golpe' }] };
    const r = simular(config, plan(j('Cerca', p(1, 0, 'pasar'))), { segura: null, esquina: 1 });
    expect(r.golpes).toEqual([]);
  });
});

describe('Probar el plan', () => {
  // Tres tandas; un jugador por columna baja una fila en cada una y, tras la última, vuelve a la fila del medio
  const tres: Config = { ...base, tandas: [{ aviso: 1, impacto: 3 }, { aviso: 4, impacto: 6 }, { aviso: 7, impacto: 9 }], final: 14 };
  const todos = plan(...[0, 1, 2].map((k) => j(`J${k}`, p(0, k), p(1, k), p(2, k))));

  it('si nadie deja huecos, el tablero se destapa entero y llegan siempre', () => {
    const r = probarTodas(tres, todos);
    expect(r).toMatchObject({ total: 9, exitos: 9, sinDestapar: 0 });
    expect(cobertura(tres, todos)).toEqual({ tanda: [[0, 0, 0], [1, 1, 1], [2, 2, 2]], huecos: [] });
  });

  it('si todas las casillas están marcadas a la vez, salir de la tuya no salva a nadie', () => {
    const lleno = plan(...Array.from({ length: 9 }, (_, i) => j(`J${i}`, p(Math.floor(i / 3), i % 3))));
    // Cada uno se aparta a la casilla vecina hacia el centro, que también está marcada (ninguno va a la esquina segura)
    const r = sim(lleno, c(0, 0));
    expect(r.muertos.filter((m) => m.causa === 'rayo')).toHaveLength(9);
  });

  it('con huecos, las casillas sin destapar son un wipe', () => {
    const r = probarTodas(base, plan(j('A', p(0, 0)), j('B', p(2, 2))));
    expect(r.sinDestapar).toBe(7);
    expect(r.exitos).toBe(2);
    const sin = r.casillas.find((x) => x.celda.f === 1 && x.celda.k === 1)!;
    expect(sin).toMatchObject({ destapada: null, exitos: 0, muertes: { final: 2 } });
    expect(cobertura(base, plan(j('A', p(0, 0)), j('B', p(2, 2)))).tanda[0]).toEqual([0, null, null]);
  });

  it('con el rayo de esquina al azar, prueba las cuatro esquinas', () => {
    const config: Config = { ...tres, rayoEsquina: { aviso: 11, impacto: 12, esquina: 'azar', ancho: 1, efecto: 'muerte' } };
    const r = probarTodas(config, todos);
    expect(r.total).toBe(36);
    // Todos acaban en la segura: el rayo los mata solo cuando la segura cae en la diagonal de esa esquina
    const esquinaSegura = r.casillas.find((x) => x.celda.f === 0 && x.celda.k === 0)!;
    expect(esquinaSegura.exitos).toBe(2);
  });
});

describe('Configuración y plan', () => {
  it('rechaza casillas fuera del tablero', () => {
    expect(problemasDelPlan(base, plan(j('A', p(3, 0))))).toHaveLength(1);
    expect(() => sim(plan(j('A')), null)).toThrow();
  });

  it('los presets tienen las tandas en orden y el final después', () => {
    for (const cfg of Object.values(PRESETS)) {
      const imp = cfg.tandas.map((x) => x.impacto);
      expect(imp).toEqual([...imp].sort((a, b) => a - b));
      expect(cfg.final).toBeGreaterThan(imp[imp.length - 1]);
      for (const x of cfg.tandas) expect(x.aviso).toBeLessThan(x.impacto);
    }
  });

  it('el azar con semilla repite el escenario', () => {
    expect(escenarioAlAzar(PRESETS.prueba1, azar(7))).toEqual(escenarioAlAzar(PRESETS.prueba1, azar(7)));
  });

  it('simula la primera Prueba con 10 jugadores por parejas desde las esquinas', () => {
    // Cada pareja recorre su borde en el sentido del reloj, una casilla por tanda; los dos del centro, por el medio
    const ruta = (...cs: [number, number][]) => cs.map(([f, k]) => p(f, k));
    const pl = plan(
      j('1a', ...ruta([0, 0], [0, 1], [0, 2], [0, 3])), j('1b', ...ruta([1, 0], [1, 1], [1, 2], [1, 3])),
      j('2a', ...ruta([0, 5], [1, 5], [2, 5], [3, 5])), j('2b', ...ruta([0, 4], [1, 4], [2, 4], [3, 4])),
      j('4a', ...ruta([5, 5], [5, 4], [5, 3], [5, 2])), j('4b', ...ruta([4, 5], [4, 4], [4, 3], [4, 2])),
      j('3a', ...ruta([5, 0], [4, 0], [3, 0], [2, 0])), j('3b', ...ruta([5, 1], [4, 1], [3, 1], [2, 1])),
      j('Ca', ...ruta([2, 2], [2, 3], [2, 2], [2, 3])), j('Cb', ...ruta([3, 2], [3, 3], [3, 2], [3, 3])),
    );
    expect(cobertura(PRESETS.prueba1, pl).huecos).toEqual([]);
    // Sale bien con la segura en cualquier casilla: de camino a ella nadie pisa una casilla a punto de recibir el rayo
    // (se espera fuera o se aparta a una vecina libre)
    expect(probarTodas(PRESETS.prueba1, pl)).toMatchObject({ exitos: 36, total: 36 });
    expect(probarTodas({ ...PRESETS.prueba1, esquivar: false }, pl).exitos).toBeLessThan(36);
    // Con los orbes del esquema (16 s), que coinciden con la 4.ª tanda (marca a los 14 s), los dos que la esperan en el
    // borde junto a cada orbe se apartan y no marcan su casilla
    const conPeligros = { ...PRESETS.prueba1, ...PELIGROS.prueba1 };
    expect(cobertura(conPeligros, pl).huecos).toEqual([c(2, 0), c(3, 5)]);
    expect(cobertura({ ...conPeligros, esquivar: false }, pl).huecos).toEqual([]);
    const r = simular(PRESETS.prueba1, pl, { segura: c(2, 3), esquina: 2 });
    expect(r.destapada).not.toBeNull();
    expect(r.fotogramas.length).toBe(Math.round(PRESETS.prueba1.final / 0.05) + 1);
  });
});
