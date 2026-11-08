import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../src/components/ConfirmDialog';

afterEach(cleanup);

function renderDialog(open: boolean) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      open={open}
      title="Cancelar reserva"
      message="¿Cancelar la reserva de Cancha Belén?"
      confirmLabel="Sí, cancelar"
      cancelLabel="No, volver"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('muestra título y mensaje', () => {
    renderDialog(true);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Cancelar reserva')).toBeTruthy();
    expect(screen.getByText('¿Cancelar la reserva de Cancha Belén?')).toBeTruthy();
  });

  it('confirma y desiste', () => {
    const { onConfirm, onCancel } = renderDialog(true);
    fireEvent.click(screen.getByText('Sí, cancelar'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('No, volver'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('no se muestra si está cerrado', () => {
    renderDialog(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
