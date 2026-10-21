# Nero Producciones — Administración y Contabilidad

## 1. Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend + Backend | **Next.js 15 (App Router) + TypeScript** | Una sola app; Server Actions y rutas API del lado servidor (las claves nunca llegan al navegador) |
| UI | Tailwind CSS + shadcn/ui | Tablas, formularios y diálogos listos |
| Base de datos | **PostgreSQL (Supabase)** | Relacional (ideal para contabilidad), Row Level Security |
| Auth | **Supabase Auth** + MFA (TOTP) | Login seguro, 2FA con Google Authenticator, sin registro público |
| Archivos | Supabase Storage (bucket privado) | PDFs/fotos de facturas, acceso solo por URLs firmadas que expiran |
| IA | **OpenAI API** en producción · **Gemini API** (plan gratis) en desarrollo | Lee PDF/imagen de la factura y devuelve JSON estructurado. Proveedor intercambiable por variable de entorno (ver 4.1) |
| Validación | Zod | Mismo esquema en formularios, servidor y respuesta de la IA |
| Deploy | Vercel + Supabase | HTTPS automático, backups de la base |

## 2. Diagrama general

```
 Navegador (usuario logueado + 2FA)
        │  HTTPS
        ▼
 ┌──────────────────────── Next.js ────────────────────────┐
 │  middleware.ts → verifica sesión + MFA en cada request   │
 │                                                          │
 │  /financiero   /eventos   /eventos/[id]   /facturas      │
 │        │            │            │             │         │
 │        └──── Server Actions (validación Zod + rol) ──────┤
 │                                     │                    │
 │                         lib/ai/leer-factura.ts ──► OpenAI / Gemini
 └─────────────────────────────────────┼────────────────────┘
                                       ▼
                 Supabase: Postgres (RLS) + Storage privado
```

## 3. Modelo de datos

La clave del diseño: **hay una sola tabla `transacciones`**. Una transacción de un evento
es simplemente una transacción con `evento_id` cargado. Así:

- **Financiero** = `SELECT * FROM transacciones` (todas).
- **Evento X** = `SELECT * FROM transacciones WHERE evento_id = X`.
- No hay que "copiar" nada: cargar un gasto en un evento ya lo hace aparecer en Financiero.

```
perfiles ─────────┐
 id (= auth.uid)  │ creado_por
 nombre, email    │
 es_admin, activo ▼
            transacciones ──────────► eventos
             id                        id
             tipo (ingreso|egreso)     nombre
             monto (numeric 14,2, ARS) fecha
                                       lugar
             fecha                     estado (planificado|en_curso|cerrado)
             descripcion               presupuesto
             categoria_id ──► categorias (id, nombre, tipo)
             evento_id   (nullable)
             factura_id  (nullable) ──► facturas
             contraparte (proveedor/cliente)
             medio_pago (efectivo|transferencia|tarjeta|...)
             creado_por, creado_en, eliminado_en (soft delete)

facturas
 id, archivo_path, estado (subida|procesando|por_revisar|aprobada|rechazada|error)
 datos_ia (jsonb: respuesta cruda de la IA)
 tipo_comprobante (A|B|C|...), punto_venta, numero
 cuit_emisor, razon_social_emisor, fecha_emision
 neto, iva, total
 transaccion_id (nullable), subida_por, creado_en
 UNIQUE (cuit_emisor, tipo_comprobante, punto_venta, numero)  ← evita cargar la misma factura dos veces

auditoria
 id, usuario_id, accion, tabla, registro_id, antes (jsonb), despues (jsonb), fecha, ip
```

**Balance del evento** = vista SQL:
```sql
CREATE VIEW balance_eventos AS
SELECT e.id, e.nombre,
  COALESCE(SUM(t.monto) FILTER (WHERE t.tipo = 'ingreso'), 0) AS ingresos,
  COALESCE(SUM(t.monto) FILTER (WHERE t.tipo = 'egreso'), 0)  AS egresos,
  COALESCE(SUM(CASE WHEN t.tipo = 'ingreso' THEN t.monto ELSE -t.monto END), 0) AS balance
FROM eventos e
LEFT JOIN transacciones t ON t.evento_id = e.id AND t.eliminado_en IS NULL
GROUP BY e.id;
```
Todos los montos están en **pesos argentinos (ARS)**; no hay multimoneda.

## 4. Secciones

### Financiero
- Tabla de todas las transacciones: fecha, tipo, descripción, categoría, **evento asociado** (link), monto, factura adjunta.
- Filtros: rango de fechas, tipo, categoría, evento, "sin evento".
- Totales arriba: ingresos, egresos, resultado del período.
- Alta/edición manual de transacciones (con selector opcional de evento).
- Exportar a Excel/CSV para el contador.

### Eventos
- Listado con tarjetas: nombre, fecha, estado, balance (verde/rojo).
- Botón "Nuevo evento".
- `/eventos/[id]`: datos del evento, resumen (ingresos / egresos / balance / vs. presupuesto), tabla de sus transacciones y botón "Agregar movimiento" (el `evento_id` ya viene fijado → aparece automáticamente en Financiero).

### Facturas (con IA)
Flujo:
1. Usuario sube PDF o foto → se guarda en Storage privado → registro `facturas` con estado `procesando`.
2. Server Action manda el archivo al proveedor de IA configurado con un esquema JSON (structured output): tipo, número, punto de venta, CUIT, razón social, fecha, neto, IVA, total, ítems, categoría sugerida.
3. Respuesta validada con Zod → estado `por_revisar`.
4. **Pantalla de revisión**: archivo a la izquierda, datos extraídos editables a la derecha; el usuario elige ingreso/egreso, categoría y evento (opcional).
5. Al aprobar → se crea la transacción (en una transacción SQL) y se vincula con la factura.

> La IA nunca escribe directo en Financiero: siempre pasa por revisión humana. En contabilidad un error de lectura (un 0 de más) no puede entrar sin que alguien lo vea.

### 4.1 Proveedor de IA intercambiable

```
lib/ai/
├─ leer-factura.ts      leerFactura(archivo) → DatosFactura   (lo único que usa la app)
├─ esquema.ts           esquema Zod de DatosFactura + prompt común
└─ proveedores/
   ├─ openai.ts         producción
   └─ gemini.ts         desarrollo (plan gratis)
```

- `AI_PROVIDER=openai|gemini` y `AI_MODEL=...` en variables de entorno eligen proveedor y modelo sin tocar código.
- Ambos proveedores devuelven el mismo `DatosFactura`, validado con Zod.
- **Plan gratis de Gemini: solo con facturas de prueba.** En el plan gratuito Google puede usar los datos enviados para mejorar sus productos, y las facturas tienen CUITs, montos y proveedores reales. Las facturas reales van solo con el proveedor pago (OpenAI), cuyas condiciones de API no usan los datos para entrenar.

### Stock
- **Depósitos** (Isidris, Centro, y los que se agreguen) y **productos** (unidad, código, stock mínimo).
- El stock no se guarda: se calcula sumando `movimientos_stock` (vista `stock_actual`), como un libro contable.
  Entradas en positivo, salidas en negativo, ajustes con signo. Los movimientos no se editan ni se borran: se corrige con un ajuste.
- **Transferencia** = salida del origen + entrada al destino con el mismo `transferencia_id`, grabadas en un solo insert.
- **Ajuste de inventario**: se ingresa lo contado; se registra la diferencia con el sistema.
- Vista general (columna por depósito + total, valorizado a costo promedio, alerta bajo mínimo) y vista por depósito.
- **Desde facturas**: la IA marca si es compra de mercadería y extrae cantidad y precio unitario por renglón. Al revisar
  se elige el depósito y se vincula cada renglón a un producto (o se crea). `aprobar_factura` graba en una sola
  operación factura + movimiento financiero + entradas de stock.

## 5. Seguridad

- **Sin registro público**: solo el admin crea usuarios (ver 5.1).
- **2FA (TOTP) obligatorio**: el middleware rechaza sesiones sin nivel `aal2`.
- Contraseñas: mínimo 12 caracteres, chequeo contra contraseñas filtradas (Supabase lo trae).
- Rate limiting en login y en la subida de facturas.
- Sesiones en cookies `httpOnly`, `Secure`, `SameSite=Lax`; expiración por inactividad.
- **Permisos por sección** (ver 5.1), chequeados en el servidor y en RLS.
- **Row Level Security** en todas las tablas: aunque alguien obtenga la clave pública, la base no devuelve nada sin sesión válida y rol adecuado.
- Validación Zod de todo input en el servidor; nada se confía del cliente.
- Bucket de facturas privado, URLs firmadas de pocos minutos, validación de tipo y tamaño de archivo.
- Claves (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) solo en variables de entorno del servidor.
- Headers: CSP, HSTS, X-Frame-Options.
- **Auditoría**: cada alta/edición/borrado queda en `auditoria` con quién, cuándo y antes/después.
- **Soft delete**: los movimientos no se borran físicamente (requisito contable).
- Backups diarios de la base.

### 5.1 Usuarios y permisos

Solo un usuario con `es_admin = true` entra a **Configuración → Usuarios**, donde puede:
- Crear un usuario (nombre + email): el sistema genera una **contraseña temporal** que el admin ve una sola vez y le pasa por un medio privado. En el primer ingreso el usuario la cambia y configura el 2FA. (No se usan invitaciones por mail: el servicio de mail incluido en Supabase solo envía a miembros del equipo del proyecto; se puede sumar un SMTP propio más adelante.)
- Restablecer la contraseña (nueva temporal) o el 2FA de un usuario que perdió el celular.
- Asignar permisos por sección:

| Sección | Niveles |
|---|---|
| Financiero | sin acceso / ver / editar |
| Eventos | sin acceso / ver / editar |
| Facturas | sin acceso / ver / editar (cargar y aprobar) |

- Desactivar un usuario (no se borra, para conservar la auditoría) y resetear su 2FA.

```
permisos
 usuario_id → perfiles
 seccion   (financiero|eventos|facturas)
 nivel     (ninguno|ver|editar)
 PRIMARY KEY (usuario_id, seccion)
```
- Las secciones sin acceso no aparecen en el menú y sus rutas devuelven 403.
- Las políticas RLS usan una función `tiene_permiso(seccion, nivel)`: el control se aplica también en la base, no solo en la interfaz.
- La `service_role` key se usa **solo** en la Server Action de crear usuarios, que primero verifica que quien llama sea admin.
- El primer admin se crea con un script de setup (`npm run crear-admin`).
- Cada cambio de permisos queda en `auditoria`.

## 6. Estructura de carpetas

```
nero-admin/
├─ app/
│  ├─ (auth)/login/            login + verificación 2FA
│  ├─ (app)/layout.tsx         sidebar con las secciones
│  ├─ (app)/financiero/
│  ├─ (app)/eventos/
│  ├─ (app)/eventos/[id]/
│  ├─ (app)/facturas/
│  ├─ (app)/facturas/[id]/revisar/
│  └─ (app)/configuracion/     usuarios, categorías
├─ components/                 tablas, formularios, UI
├─ lib/
│  ├─ supabase/                clientes server/browser
│  ├─ ai/                      leerFactura + proveedores OpenAI/Gemini
│  ├─ schemas/                 Zod (transaccion, evento, factura)
│  └─ auth/                    helpers de rol y MFA
├─ actions/                    Server Actions por dominio
├─ supabase/migrations/        SQL: tablas, vistas, RLS, triggers de auditoría
└─ middleware.ts
```

## 7. Plan de construcción

1. **Base**: proyecto Next.js, Supabase, migraciones, login + 2FA, layout con secciones, panel de usuarios y permisos.
2. **Financiero**: CRUD de transacciones, categorías, filtros, totales.
3. **Eventos**: CRUD de eventos, detalle con movimientos y balance.
4. **Facturas**: subida, lectura con IA, pantalla de revisión, aprobación → transacción.
5. **Extras**: auditoría visible, exportación Excel, dashboard con gráficos.
