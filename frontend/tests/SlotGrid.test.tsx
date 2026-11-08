import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Slot } from '../src/api';
import { SlotGrid } from '../src/components/SlotGrid';

afterEach(cleanup);

const slots: Slot[] = Array.from({ length: 24 }, (_, h) => ({
  startHour: h,
  label: `${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00`,
  status: h === 14 ? 'reserved' : 'available',
  selectable: h > 10 && h !== 14,
}));

describe('SlotGrid', () => {
  it('muestra los 24 bloques con su estado', () => {
    render(<SlotGrid slots={slots} selectedHour={null} onSelect={() => undefined} />);
    expect(screen.getAllByRole('button')).toHaveLength(24);
    expect(screen.getByText('00:00–01:00')).toBeTruthy();
    expect(screen.getByText('23:00–24:00')).toBeTruthy();
    expect(screen.getAllByText('Reservado')).toHaveLength(1);
    expect(screen.getAllByText('Disponible')).toHaveLength(23);
  });

  it('deshabilita los bloques no seleccionables', () => {
    render(<SlotGrid slots={slots} selectedHour={null} onSelect={() => undefined} />);
    const buttons = screen.getAllByRole('button') as HTMLButtonElement[];
    expect(buttons[14].disabled).toBe(true);
    expect(buttons[5].disabled).toBe(true);
    expect(buttons[15].disabled).toBe(false);
  });

  it('llama a onSelect con la hora de inicio', () => {
    const onSelect = vi.fn();
    render(<SlotGrid slots={slots} selectedHour={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('15:00–16:00'));
    expect(onSelect).toHaveBeenCalledWith(15);
    fireEvent.click(screen.getByText('14:00–15:00'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
