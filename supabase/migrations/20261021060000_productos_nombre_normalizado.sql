-- Productos: "FERNET BRANCA X 750 CC" y "Fernet Branca 750cc" son el mismo.
-- Se compara el nombre sin mayúsculas, acentos, la "x" suelta ni signos.
-- (La pantalla de revisión de facturas usa la misma regla en normalizarNombre.)

create function public.normalizar_nombre(texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(
      lower(translate(texto, 'áéíóúüñÁÉÍÓÚÜÑàèìòùÀÈÌÒÙ', 'aeiouunaeiouunaeiouaeiou')),
      '\mx\M', '', 'g'
    ),
    '[^a-z0-9]', '', 'g'
  )
$$;

-- No se pueden crear dos productos que normalizados se llamen igual.
create unique index productos_nombre_normalizado_unico on public.productos (public.normalizar_nombre(nombre));

-- aprobar_factura: un producto "nuevo" que ya existe con otro formato de nombre se suma al existente.
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
    revisada_por          = auth.uid()
  where id = p_factura_id and estado in ('por_revisar', 'error');

  if not found then
    raise exception 'La factura no existe, ya fue procesada o no tenés permiso';
  end if;

  insert into public.transacciones (
    tipo, monto, fecha, descripcion, categoria_id, evento_id, contraparte,
    medio_pago, estado, facturado, iva, notas, factura_id
  ) values (
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
