-- Facturas por mail: cada comprobante tiene un link público con token para que
-- el cliente la vea y la descargue (sin usuario), y se registra a quién se envió.

alter table public.comprobantes_emitidos
  add column token text unique,
  add column mail_enviado_a text,
  add column mail_enviado_en timestamptz;

-- Token para los comprobantes ya emitidos (32 caracteres aleatorios, base64url).
update public.comprobantes_emitidos
set token = translate(encode(gen_random_bytes(24), 'base64'), '+/', '-_')
where token is null;
