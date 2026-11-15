# Maker Labs

Aplicación de administración para operaciones y finanzas de Maker Labs. La interfaz React conserva el diseño del proyecto; la API corre en Cloudflare Workers, usa D1 para datos y R2 para adjuntos financieros. Firebase y Supabase no forman parte de esta arquitectura.

## Desarrollo local

Instala las dependencias y crea la base D1 local a partir de las migraciones:

```sh
npm install
npm run db:migrate:local
```

Copia `.dev.vars.example` a `.dev.vars` y coloca un secreto aleatorio en `SESSION_SECRET`. Luego inicia el servidor integrado de Vite y Cloudflare:

```sh
npm run dev
```

La primera cuenta registrada en una base vacía tendrá rol de administradora. Las cuentas siguientes comienzan como operadores. Para el servidor Node con SQLite local, usa `npm run dev:node`; registra la primera cuenta para crear el administrador inicial.

## Preparación de Cloudflare

Este repositorio no crea recursos automáticamente. La base `maker-labs-db` ya está creada en la cuenta Cloudflare y su `database_id` está configurado en `wrangler.jsonc`. Cuando se autorice continuar con los recursos restantes:

1. Crea el bucket R2:

   ```sh
   npx wrangler r2 bucket create maker-labs-files
   ```

2. Mantén los nombres de bindings `DB` y `FILES` y el bucket `maker-labs-files`.
3. Configura el secreto de sesión para el Worker:

   ```sh
   npx wrangler secret put SESSION_SECRET
   ```

4. Aplica las migraciones remotas y despliega:

   ```sh
   npm run db:migrate:remote
   npm run deploy
   ```

5. Abre la app y registra la cuenta administradora inicial antes de compartir el enlace. La cuenta registrada primero en una base vacía recibe el rol de administrador.

No despliegues antes de crear el bucket R2, configurar `SESSION_SECRET` y aplicar las migraciones D1.

## Variables

- `.dev.vars` es solo para secretos usados durante el desarrollo local; no se versiona.
- `SESSION_SECRET` debe ser aleatorio y privado. No reutilices el valor de ejemplo en producción.
- Los bindings D1 y R2 se declaran en `wrangler.jsonc`, no mediante tokens REST en archivos `.env`.
