import { describe, expect, it } from 'vitest';
import { checkActiveRule, parseSlotInput } from '../src/rules.js';

const belen14 = { courtId: 3, date: '2026-11-10', startHour: 14 };

describe('checkActiveRule (FR-019)', () => {
  it('permite reservar sin reservas activas', () => {
    expect(checkActiveRule([], belen14)).toBeNull();
  });

  it('permite el bloque inmediatamente anterior o posterior en la misma cancha', () => {
    expect(checkActiveRule([belen14], { ...belen14, startHour: 15 })).toBeNull();
    expect(checkActiveRule([belen14], { ...belen14, startHour: 13 })).toBeNull();
  });

  it('rechaza otra cancha o un bloque no contiguo', () => {
    expect(checkActiveRule([belen14], { courtId: 1, date: '2026-11-10', startHour: 15 })).toBe('ACTIVE_RESERVATION_EXISTS');
    expect(checkActiveRule([belen14], { ...belen14, startHour: 17 })).toBe('ACTIVE_RESERVATION_EXISTS');
    expect(checkActiveRule([belen14], { ...belen14, date: '2026-11-11' })).toBe('ACTIVE_RESERVATION_EXISTS');
  });

  it('considera contiguos 23:00 de un día y 00:00 del siguiente', () => {
    const late = { courtId: 3, date: '2026-11-10', startHour: 23 };
    expect(checkActiveRule([late], { courtId: 3, date: '2026-11-11', startHour: 0 })).toBeNull();
    const early = { courtId: 3, date: '2026-11-11', startHour: 0 };
    expect(checkActiveRule([early], { courtId: 3, date: '2026-11-10', startHour: 23 })).toBeNull();
  });

  it('rechaza un tercer bloque', () => {
    expect(checkActiveRule([belen14, { ...belen14, startHour: 15 }], { ...belen14, startHour: 16 })).toBe(
      'MAX_CONSECUTIVE_REACHED',
    );
  });
});

describe('parseSlotInput', () => {
  it('acepta un bloque entero válido', () => {
    expect(parseSlotInput({ courtId: 3, date: '2026-11-10', startHour: 14 })).toEqual(belen14);
  });

  it('rechaza bloques parciales, fuera de rango o con tipos incorrectos', () => {
    for (const startHour of [10.5, 24, -1, '14', null]) {
      expect(parseSlotInput({ courtId: 3, date: '2026-11-10', startHour })).toBeNull();
    }
    expect(parseSlotInput({ courtId: 3, date: '2026-02-30', startHour: 10 })).toBeNull();
    expect(parseSlotInput({ courtId: '3', date: '2026-11-10', startHour: 10 })).toBeNull();
    expect(parseSlotInput(undefined)).toBeNull();
  });
});
