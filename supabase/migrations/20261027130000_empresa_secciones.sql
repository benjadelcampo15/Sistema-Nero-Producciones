-- Eventos, facturas recibidas, facturas emitidas y objetivos también son de Nero o de Ruta.
-- Lo que ya existía queda como Nero.
alter table public.eventos add column if not exists empresa text not null default 'nero';
alter table public.facturas add column if not exists empresa text not null default 'nero';
alter table public.comprobantes_emitidos add column if not exists empresa text not null default 'nero';
alter table public.objetivos_meses add column if not exists empresa text not null default 'nero';

alter table public.eventos drop constraint if exists eventos_empresa_check;
alter table public.eventos add constraint eventos_empresa_check check (empresa in ('nero', 'ruta'));
alter table public.facturas drop constraint if exists facturas_empresa_check;
alter table public.facturas add constraint facturas_empresa_check check (empresa in ('nero', 'ruta'));
alter table public.comprobantes_emitidos drop constraint if exists comprobantes_emitidos_empresa_check;
alter table public.comprobantes_emitidos add constraint comprobantes_emitidos_empresa_check check (empresa in ('nero', 'ruta'));
alter table public.objetivos_meses drop constraint if exists objetivos_meses_empresa_check;
alter table public.objetivos_meses add constraint objetivos_meses_empresa_check check (empresa in ('nero', 'ruta'));

-- Objetivos: un mes por empresa.
alter table public.objetivos_meses drop constraint if exists objetivos_meses_anio_mes_key;
alter table public.objetivos_meses drop constraint if exists objetivos_meses_empresa_anio_mes_key;
alter table public.objetivos_meses add constraint objetivos_meses_empresa_anio_mes_key unique (empresa, anio, mes);

-- Al aprobar una factura, el movimiento va al financiero de la empresa elegida.
create or replace function public.aprobar_factura(p_factura_id uuid, p_factura jsonb, p_transaccion jsonb, p_stock jsonb default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_transaccion_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_comprobante text;
begin
  update public.facturas set
    tipo_comprobante      = p_factura ->> 'tipo_comprobante',
    punto_venta           = p_factura ->> 'punto_venta',
    numero                = p_factura ->> 'numero',
    fecha_emision         = (p_factura ->> 'fecha_emision')::date,
    cuit_emisor           = p_factura ->> 'cuit_emisor',
    razon_social_emisor   = p_factura ->> 'razon_social_emisor',
    cuit_receptor         = p_factura ->> 'cuit_receptor',
    razon_social_receptor = p_factura ->> 'razon_social_receptor',
    neto                  = (p_factura ->> 'neto')::numeric,
    iva                   = (p_factura ->> 'iva')::numeric,
    total                 = (p_factura ->> 'total')::numeric,
    estado                = 'aprobada',
    empresa               = coalesce(nullif(p_transaccion ->> 'empresa', ''), 'nero'),
    revisada_por          = auth.uid()
  where id = p_factura_id and estado in ('por_revisar', 'error');

  if not found then
    raise exception 'La factura no existe, ya fue procesada o no tenés permiso';
  end if;

  insert into public.transacciones (
    empresa, tipo, monto, fecha, descripcion, categoria_id, evento_id, contraparte,
    medio_pago, estado, facturado, iva, notas, factura_id
  ) values (
    coalesce(nullif(p_transaccion ->> 'empresa', ''), 'nero'),
    (p_transaccion ->> 'tipo')::public.tipo_movimiento,
    (p_transaccion ->> 'monto')::numeric,
    (p_transaccion ->> 'fecha')::date,
    p_transaccion ->> 'descripcion',
    (p_transaccion ->> 'categoria_id')::uuid,
    nullif(p_transaccion ->> 'evento_id', '')::uuid,
    nullif(p_transaccion ->> 'contraparte', ''),
    (p_transaccion ->> 'medio_pago')::public.medio_pago,
    (p_transaccion ->> 'estado')::public.estado_movimiento,
    true,
    nullif(p_transaccion ->> 'iva', '')::numeric,
    nullif(p_transaccion ->> 'notas', ''),
    p_factura_id
  )
  returning id into v_transaccion_id;

  if p_stock is not null and jsonb_array_length(coalesce(p_stock -> 'items', '[]'::jsonb)) > 0 then
    if nullif(p_stock ->> 'deposito_id', '') is null then
      raise exception 'Elegí a qué depósito ingresa la mercadería';
    end if;
    v_comprobante := concat_ws(' ', p_factura ->> 'tipo_comprobante',
      nullif(concat_ws('-', p_factura ->> 'punto_venta', p_factura ->> 'numero'), ''));

    for v_item in select * from jsonb_array_elements(p_stock -> 'items') loop
      v_producto_id := nullif(v_item ->> 'producto_id', '')::uuid;
      if v_producto_id is null then
        -- Producto "nuevo": si ya existe uno que normalizado se llama igual, se usa ese.
        select id into v_producto_id from public.productos
        where public.normalizar_nombre(nombre) = public.normalizar_nombre(v_item ->> 'producto_nuevo');
        if v_producto_id is null then
          insert into public.productos (nombre, unidad)
          values (trim(v_item ->> 'producto_nuevo'), coalesce(nullif(v_item ->> 'unidad', ''), 'unidad'))
          returning id into v_producto_id;
        end if;
      end if;

      insert into public.movimientos_stock (
        producto_id, deposito_id, tipo, cantidad, costo_unitario, fecha, motivo, factura_id
      ) values (
        v_producto_id,
        (p_stock ->> 'deposito_id')::uuid,
        'entrada',
        (v_item ->> 'cantidad')::numeric,
        nullif(v_item ->> 'costo_unitario', '')::numeric,
        (p_transaccion ->> 'fecha')::date,
        'Compra ' || coalesce(nullif(v_comprobante, ''), 'según factura'),
        p_factura_id
      );
    end loop;
  end if;

  return v_transaccion_id;
end
$$;
