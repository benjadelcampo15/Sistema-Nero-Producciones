-- Un cheque cargado desde un movimiento de Financiero queda vinculado a él:
-- en el cashflow cuenta una sola vez (mientras está pendiente, en la fecha
-- de pago del cheque).
alter table public.cheques
  add column transaccion_id uuid unique references public.transacciones (id) on delete set null;
