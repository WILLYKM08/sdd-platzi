import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Availability } from '../src/api';

vi.mock('../src/api', async (importActual) => ({
  ...(await importActual<typeof import('../src/api')>()),
  getAvailability: vi.fn(),
  createReservation: vi.fn(),
}));

const api = await import('../src/api');
const { CourtAvailabilityPage } = await import('../src/pages/CourtAvailabilityPage');
const getAvailability = vi.mocked(api.getAvailability);

/** Grilla de la fecha `date` con los bloques `reserved` ocupados. */
function grid(date: string, reserved: number[]): Availability {
  return {
    court: { id: 3, name: 'Cancha Belén' },
    date,
    bookingWindow: { from: '2026-11-07', to: '2026-11-20' },
    slots: Array.from({ length: 24 }, (_, h) => ({
      startHour: h,
      label: `${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00`,
      status: reserved.includes(h) ? 'reserved' : 'available',
      selectable: !reserved.includes(h),
    })),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function renderPage() {
  render(
    <MemoryRouter initialEntries={['/canchas/3']}>
      <Routes>
        <Route path="/canchas/:courtId" element={<CourtAvailabilityPage />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByLabelText('Fecha');
}

const slotButtons = () => screen.queryAllByRole('button').filter((b) => /^\d{2}:00–/.test(b.textContent ?? ''));

beforeEach(() => {
  getAvailability.mockReset();
});
afterEach(cleanup);

describe('CourtAvailabilityPage', () => {
  it('ignora una respuesta lenta de una fecha anterior (#3)', async () => {
    getAvailability.mockResolvedValueOnce(grid('2026-11-07', []));
    await renderPage();

    const b = deferred<Availability>();
    const c = deferred<Availability>();
    getAvailability.mockReturnValueOnce(b.promise).mockReturnValueOnce(c.promise);

    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-11-11' } });

    await act(async () => c.resolve(grid('2026-11-11', [20])));
    await act(async () => b.resolve(grid('2026-11-10', [5, 6, 7])));

    expect(screen.getAllByText('Reservado')).toHaveLength(1);
    expect((slotButtons()[20] as HTMLButtonElement).disabled).toBe(true);
    expect((slotButtons()[5] as HTMLButtonElement).disabled).toBe(false);
  });

  it('no deja seleccionable la grilla de otra fecha si la carga falla (#4)', async () => {
    getAvailability.mockResolvedValueOnce(grid('2026-11-07', []));
    await renderPage();
    expect(slotButtons()).toHaveLength(24);

    getAvailability.mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR', message: 'Ocurrió un problema inesperado.' });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-11-10' } });
    });

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(slotButtons()).toHaveLength(0);
    expect(screen.getByLabelText('Fecha')).toBeTruthy();
  });
});
