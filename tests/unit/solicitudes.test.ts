// Cifrado del webhook, validación de su dirección y texto del aviso de «Solicitar análisis».
import { beforeAll, describe, expect, it } from 'vitest';
import { cifrar, descifrar } from '@/lib/cifrado';
import { webhookValido } from '@/lib/discord';
import { mensajeSolicitud } from '@/lib/solicitudes';

beforeAll(() => { process.env.AUTH_SECRET ??= 'secreto-de-prueba-para-vitest-0123456789'; });

describe('cifrado', () => {
  it('descifra lo que cifra y cada cifrado es distinto', () => {
    const url = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_ABC-123';
    const a = cifrar(url), b = cifrar(url);
    expect(a).not.toBe(b);
    expect(a).not.toContain('discord');
    expect(descifrar(a)).toBe(url);
  });
  it('devuelve null si el cifrado está alterado o no tiene formato', () => {
    const a = cifrar('hola');
    const partes = a.split('.');
    partes[3] = Buffer.from('adios').toString('base64url');
    expect(descifrar(partes.join('.'))).toBeNull();
    expect(descifrar('texto-en-claro')).toBeNull();
  });
});

describe('webhookValido', () => {
  it.each([
    'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_ABC-123',
    'https://discordapp.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_ABC-123',
    'https://ptb.discord.com/api/v10/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_ABC-123/',
  ])('acepta %s', (u) => expect(webhookValido(u)).toBe(true));
  it.each([
    'http://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz',
    'https://discord.com.evil.io/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz',
    'https://evil.io/discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz',
    'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz?wait=true',
    'https://discord.com/api/webhooks/123/abc',
  ])('rechaza %s', (u) => expect(webhookValido(u)).toBe(false));
});

describe('mensajeSolicitud', () => {
  const p = { nombre: 'Veterano1', raids: 5, kills: 2, dps_medio: 123456, hps_medio: 2500, muertes_intento: 0.35, gs: 3120, ultima: '2026-11-08T21:00:00Z', perfil: false };
  it('en español, sin menciones y con el enlace al perfil', () => {
    const m = mensajeSolicitud(p, 'https://x.test/jugadores/veterano1', 'es');
    expect(m.split('\n')).toHaveLength(4);
    expect(m).toContain('**Veterano1** pide el análisis');
    expect(m).toContain('5 raids (2 con kill)');
    expect(m).toContain('0,35 muertes por intento');
    expect(m).toContain('Última raid: 2026-11-08');
    expect(m).toContain('todavía no');
    expect(m).not.toMatch(/@everyone|@here/);
  });
  it('en inglés', () => {
    const m = mensajeSolicitud({ ...p, perfil: true }, 'https://x.test/en/jugadores/veterano1', 'en');
    expect(m).toContain('asks for their profile analysis');
    expect(m).toContain('0.35 deaths per attempt');
    expect(m).toContain('Profile written by Claude: yes');
  });
});
