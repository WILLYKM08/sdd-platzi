import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatePicker } from '../src/components/DatePicker';

afterEach(cleanup);

describe('DatePicker', () => {
  it('limita la selección a la ventana de reserva', () => {
    render(<DatePicker value="2026-11-08" min="2026-11-07" max="2026-11-20" onChange={() => undefined} />);
    const input = screen.getByLabelText('Fecha') as HTMLInputElement;
    expect(input.type).toBe('date');
    expect(input.min).toBe('2026-11-07');
    expect(input.max).toBe('2026-11-20');
    expect(input.value).toBe('2026-11-08');
  });

  it('notifica el cambio de fecha', () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-11-08" min="2026-11-07" max="2026-11-20" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-11-10' } });
    expect(onChange).toHaveBeenCalledWith('2026-11-10');
  });
});
