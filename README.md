# Nero Producciones · Administración

Sistema de administración y contabilidad. Arquitectura en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

Stack: Next.js 16 + TypeScript + Tailwind · Supabase (Postgres, Auth con 2FA, Storage).

## Puesta en marcha

### 1. Variables de entorno

Copiá `.env.example` como `.env.local` y completá con los datos de Supabase
(**Project Settings → API Keys**). `.env.local` no se sube a git.

### 2. Base de datos

En Supabase → **SQL Editor**, pegá y ejecutá cada archivo de `supabase/migrations/`
en orden (por nombre).

### 3. Configuración de Auth en Supabase

En **Authentication**:

- **Sign In / Providers → Email**: desactivar **Allow new users to sign up**
  (los usuarios los crea solo el admin desde la app).
- **Sign In / Providers → Email**: largo mínimo de contraseña **12**.
- **Multi-Factor**: verificar que **TOTP** esté habilitado.

### 4. Primer administrador

```bash
npm run crear-admin -- tu@email.com "Tu Nombre"
```

Muestra una contraseña temporal. Al ingresar la primera vez se pide cambiarla
y configurar la verificación en dos pasos (Google Authenticator o similar).

### 5. Levantar en local

```bash
npm run dev
```

Abrir http://localhost:3000

## Ingreso y seguridad

- Sin registro público: el admin crea usuarios desde **Usuarios** y recibe una
  contraseña temporal para pasarle a la persona.
- Primer ingreso: cambiar contraseña → configurar 2FA. Después: contraseña + código.
- Permisos por sección (Financiero, Eventos, Facturas): sin acceso / ver / editar.
- La base exige sesión con 2FA (RLS) para leer cualquier dato; las escrituras
  pasan solo por el servidor.
- Toda acción de administración queda en la tabla `auditoria`.
