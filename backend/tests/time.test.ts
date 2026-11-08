import { describe, expect, it } from 'vitest';
import {
  addDays,
  bookingWindow,
  isValidDate,
  isWithinWindow,
  slotEnd,
  slotLabel,
  slotStart,
  todayInMedellin,
} from '../src/time.js';

describe('time', () => {
  it('calcula la fecha de hoy en Medellín (UTC−5)', () => {
    expect(todayInMedellin(new Date('2026-11-08T04:59:00Z'))).toBe('2026-11-07');
    expect(todayInMedellin(new Date('2026-11-08T05:00:00Z'))).toBe('2026-11-08');
  });

  it('valida fechas reales', () => {
    expect(isValidDate('2026-11-10')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2026-11-1')).toBe(false);
    expect(isValidDate(20261110)).toBe(false);
  });

  it('suma días cruzando mes y año', () => {
    expect(addDays('2026-12-25', 13)).toBe('2027-01-07');
  });

  it('convierte un bloque local a instante absoluto', () => {
    expect(slotStart('2026-11-10', 14).toISOString()).toBe('2026-11-10T19:00:00.000Z');
    expect(slotEnd('2026-11-10', 23).toISOString()).toBe('2026-11-11T05:00:00.000Z');
  });

  it('la ventana es hoy..hoy+13', () => {
    const now = new Date('2026-11-07T15:00:00Z');
    expect(bookingWindow(now)).toEqual({ from: '2026-11-07', to: '2026-11-20' });
    expect(isWithinWindow('2026-11-20', now)).toBe(true);
    expect(isWithinWindow('2026-11-21', now)).toBe(false);
    expect(isWithinWindow('2026-11-06', now)).toBe(false);
  });

  it('genera etiquetas en formato 24 h', () => {
    expect(slotLabel(0)).toBe('00:00–01:00');
    expect(slotLabel(14)).toBe('14:00–15:00');
    expect(slotLabel(23)).toBe('23:00–24:00');
  });
});
