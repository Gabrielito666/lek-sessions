# LEK-SESSIONS v3.0.1

Sistema de sesiones con rotación de tokens y almacenamiento intercambiable para Node.js.

---

## Introducción

`lek-sessions` es una librería que implementa un sistema de sesiones basado en **dual-token**: cada sesión genera un par `access_token` + `refresh_token`. El access_token se usa para confirmar requests; el refresh_token permite rotar la sesión y obtener un nuevo par.

El esquema criptográfico funciona de la siguiente manera:

- Al crear una sesión se generan dos pares de llaves (uno para access, otro para refresh).
- Cada llave privada es un buffer aleatorio de 64 bytes.
- Cada llave pública es el hash (bcrypt) de su respectiva llave privada.
- El hash viaja dentro del token cifrado con AES-GCM.
- Para confirmar, se descifra el token, se obtiene el hash, y se compara contra la llave privada almacenada usando `bcrypt.compare`.

**Versión 3.0.1** introduce un contrato `IStorage` que permite inyectar cualquier backend de almacenamiento (memoria, SQLite, Redis, PostgreSQL, archivo, etc.) sin modificar el núcleo de la librería.

---

## Instalación

```bash
npm install lek-sessions
```

**Requisitos:**
- Node.js 20 o superior (usa `node:test`, `crypto` nativo)

---

## Uso básico

```javascript
const LekSessions = require("lek-sessions");
const MemoryStorage = require("lek-sessions/memory-storage");

const sessions = new LekSessions("mi-clave-secreta-muy-segura", {
	storage: new MemoryStorage(),
	access_max_age: 60 * 60 * 24 * 7,    // 7 días
	refresh_max_age: 60 * 60 * 24 * 30,  // 30 días
});

// Crear sesión
const resultado = await sessions.create("usuario-123", {
	metadata: { rol: "admin" }
});
// resultado: { access_token, refresh_token, expires_access_token_at }

// Confirmar access_token
const confirmacion = await sessions.confirm(access_token);
// confirmacion.success === true  → { success, id_subject, metadata }
// confirmacion.success === false → { success, error_type }

// Refrescar sesión
const refrescado = await sessions.refresh(refresh_token);
// refrescado: { access_token, refresh_token, expires_access_token_at }

// Revocar sesión
await sessions.revoke(access_token);

// Cerrar storage (libera recursos, timers, etc.)
await sessions.close();
```

---

## API de métodos

### `constructor`

```javascript
/**
 * @param {string} secret_key
 * @param {Partial<IOptions>} [options]
 */
new LekSessions(secret_key, options?)
```

**Parámetros:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `secret_key` | `string` | Clave secreta del servidor usada para cifrar tokens |
| `options` | `Partial<IOptions>` | Opcional. Configuración de la instancia |

**Opciones (`IOptions`):**

| Propiedad | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `storage` | `IStorage` | `new MemoryStorage()` | Implementación de almacenamiento |
| `access_max_age` | `number` | 2592000 (30 días) | TTL del access_token en segundos |
| `refresh_max_age` | `number` | 31536000 (365 días) | TTL del refresh_token en segundos |

**Ejemplo:**

```javascript
const sessions = new LekSessions("clave-secreta", {
	access_max_age: 3600, // 1 hora
	refresh_max_age: 86400 * 7, // 7 días
});
```

---

### `create`

```javascript
/**
 * @param {string} id_subject
 * @param {{ metadata: TMetadata, access_max_age?: number, refresh_max_age?: number }} options
 * @returns {Promise<{ access_token: string, refresh_token: string, expires_access_token_at: Date }>}
 */
sessions.create(id_subject, options)
```

Crea una nueva sesión para un sujeto (`id_subject`). Genera un par de llaves para access y otro para refresh, crea los tokens, y almacena la sesión.

**Ejemplo:**

```javascript
const sesion = await sessions.create("user-42", {
	metadata: { ip: "192.168.1.1", userAgent: "Mozilla/..." },
	access_max_age: 300, // 5 minutos para esta sesión en particular
});

// Guardar tokens para enviar al cliente
res.cookie("access_token", sesion.access_token, {
	httpOnly: true,
	secure: true,
	expires: sesion.expires_access_token_at
});
```

---

### `confirm`

```javascript
/**
 * @param {string} access_token
 * @returns {Promise<{
 *   success: true, id_subject: string, metadata: TMetadata
 * }|{
 *   success: false, error_type: "invalid-token"|"invalid-session"|"revoked"|"access-expires"
 * }>}
 */
sessions.confirm(access_token)
```

Verifica que un `access_token` sea válido. Descifra el token, busca la sesión en el storage, verifica que no esté revocada ni expirada, y comprueba que la llave privada almacenada corresponda al hash incluido en el token.

**Ejemplo:**

```javascript
const resultado = await sessions.confirm(token);

if(!resultado.success)
{
	if(resultado.error_type === "invalid-token") return res.status(401).send("Token inválido");
	if(resultado.error_type === "revoked") return res.status(401).send("Sesión revocada");
	if(resultado.error_type === "access-expires") return res.status(401).send("Token expirado, use refresh");
	if(resultado.error_type === "invalid-session") return res.status(401).send("Sesión no encontrada");
}

console.log("Usuario:", resultado.id_subject);
console.log("Metadata:", resultado.metadata);
// Continuar con la request
```

---

### `refresh`

```javascript
/**
 * @param {string} refresh_token
 * @returns {Promise<{
 *   success: true, access_token: string, refresh_token: string, expires_access_token_at: Date
 * }|{
 *   success: false, error_type: "invalid-token"|"invalid-session"|"revoked"|"refresh-expires"
 * }>}
 */
sessions.refresh(refresh_token)
```

Rota una sesión completa: verifica el refresh_token, invalida las llaves anteriores, genera un nuevo par de llaves (access + refresh), crea nuevos tokens, y actualiza la sesión en el storage.

**Importante:** cada refresh_token solo puede usarse una vez. Si se intenta usar nuevamente, el método detecta que las llaves no coinciden y devuelve `invalid-token`.

**Ejemplo:**

```javascript
const refrescado = await sessions.refresh(refresh_token);

if(refrescado.success)
{
	// Reemplazar cookies con los nuevos tokens
	res.cookie("access_token", refrescado.access_token, {
		httpOnly: true,
		secure: true,
		expires: refrescado.expires_access_token_at
	});
	res.cookie("refresh_token", refrescado.refresh_token, {
		httpOnly: true,
		secure: true
	});
}
```

---

### `revoke`

```javascript
/**
 * @param {string} access_token
 * @returns {Promise<void>}
 */
sessions.revoke(access_token)
```

Revoca la sesión asociada al `access_token`. Extrae el `id_session` del token y llama a `storage.revoke()`. Si el token es inválido, la operación es un no-op (no lanza error).

**Ejemplo:**

```javascript
app.post("/logout", async(req, res) =>
{
	await sessions.revoke(req.cookies.access_token);
	res.clearCookie("access_token");
	res.clearCookie("refresh_token");
	res.sendStatus(200);
});
```

---

### `close`

```javascript
/**
 * @returns {Promise<void>}
 */
sessions.close()
```

Cierra el storage, liberando recursos como timers de limpieza, conexiones a bases de datos, etc. Siempre debe llamarse al cerrar la aplicación.

**Ejemplo:**

```javascript
process.on("SIGTERM", async() =>
{
	await sessions.close();
	process.exit(0);
});
```

---

## Sistema de almacenamiento (`IStorage`)

`LekSessions` no almacena sesiones directamente. Delega esta responsabilidad en una implementación del contrato `IStorage`. Esto permite usar cualquier backend sin modificar el núcleo.

El storage por defecto es `MemoryStorage`, que mantiene las sesiones en un `Map` en memoria. **No es persistente**: al reiniciar el proceso, las sesiones se pierden.

### Contrato `IStorage`

```javascript
/**
 * @template {Metadata} TMetadata
 * @typedef {{
 *   set(id_session: string, session: ISession<TMetadata>): void|Promise<void>;
 *   get(id_session: string): ISession<TMetadata>|undefined|Promise<ISession<TMetadata>|undefined>;
 *   revoke(id_session: string): void|Promise<void>;
 *   delete(id_session: string): void|Promise<void>;
 *   close(): void|Promise<void>;
 * }} IStorage
 */
```

| Método | Descripción |
|--------|-------------|
| `set(id_session, session)` | Guarda o actualiza una sesión |
| `get(id_session)` | Obtiene una sesión por su ID |
| `revoke(id_session)` | Marca una sesión como revocada |
| `delete(id_session)` | Elimina una sesión del storage |
| `close()` | Libera recursos (conexiones, timers, etc.) |

Cada método puede ser síncrono o asíncrono (`void` o `Promise<void>`).

### Cómo implementar un storage personalizado

Para crear tu propio storage, importa los tipos desde `lek-sessions` y usa `@implements` en tu clase:

```javascript
/**
 * @import {IStorage, ISession, Metadata} from "lek-sessions"
 */

/**
 * @implements {IStorage<Metadata>}
 */
const MyStorage = class
{
	/** @type {Map<string, ISession<Metadata>>} */
	#db;
	
	constructor()
	{
		this.#db = new Map();
	}
	
	/** @type {IStorage<Metadata>["get"]} */
	get(id_session)
	{
		return this.#db.get(id_session);
	}
	
	/** @type {IStorage<Metadata>["set"]} */
	set(id_session, session)
	{
		this.#db.set(id_session, session);
	}
	
	/** @type {IStorage<Metadata>["revoke"]} */
	revoke(id_session)
	{
		const session = this.#db.get(id_session);
		if(session) session.revoked = true;
	}
	
	/** @type {IStorage<Metadata>["delete"]} */
	delete(id_session)
	{
		this.#db.delete(id_session);
	}
	
	/** @type {IStorage<Metadata>["close"]} */
	close()
	{
		this.#db.clear();
	}
};
```

Luego se inyecta en el constructor:

```javascript
const sessions = new LekSessions("clave-secreta", {
	storage: new MyStorage()
});
```

---

## `MemoryStorage` incluido

`MemoryStorage` es la implementación por defecto. Almacena las sesiones en un `Map` en memoria.

### Opciones

| Propiedad | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `delete_on_revoke` | `boolean` | `true` | Si es `true`, elimina la entrada del Map al revocar. Si es `false`, solo marca `revoked: true` |
| `auto_clean_up` | `boolean` | `true` | Activa un timer que limpia sesiones expiradas automáticamente |
| `clean_up_interval` | `number` | `3600000` (1 hora) | Intervalo del timer de limpieza en milisegundos |

### Comportamiento de limpieza

El método interno `#clean()` recorre el Map y elimina sesiones que cumplen alguna de estas condiciones:

- Están marcadas como `revoked: true`.
- Ambos tokens (access y refresh) han expirado.

### Ejemplo con opciones personalizadas

```javascript
const MemoryStorage = require("lek-sessions/memory-storage");
const storage = new MemoryStorage({
	delete_on_revoke: false,     // Conservar registro de sesiones revocadas
	auto_clean_up: true,
	clean_up_interval: 60000     // Limpiar cada minuto
});
```

---

## Códigos de error

Los métodos `confirm` y `refresh` devuelven un objeto con `success: false` y un `error_type` que indica la causa del rechazo.

| error_type | Método | Significado |
|------------|--------|-------------|
| `invalid-token` | confirm, refresh | El token está malformado, corrupto, fue alterado, o se usó una `secret_key` incorrecta. También ocurre en `refresh` cuando se intenta reutilizar un refresh_token ya rotado |
| `invalid-session` | confirm, refresh | El `id_session` extraído del token no existe en el storage (pudo ser eliminado externamente) |
| `revoked` | confirm, refresh | La sesión fue revocada mediante `revoke()` |
| `access-expires` | confirm | El access_token ha expirado según su fecha de expiración. La sesión sigue activa si el refresh_token no ha expirado |
| `refresh-expires` | refresh | El refresh_token ha expirado. La sesión se revoca automáticamente al detectar esta condición |

---

## Migración desde v1

| v1 | v3 |
|----|----|
| `useLekSessions(config)` (async) | `new LekSessions(secret_key, options)` (sync) |
| Storage fijo (no configurable) | Storage inyectable mediante `IStorage` |
| Sin metadata en sesión | Soporte para `metadata` genérica |
| Formato de tokens antiguo | Tokens incompatibles con v1 (nuevo cifrado en `lek-cryptools`) |

**Importante:** los tokens generados con v1 no son compatibles con v3. Al migrar, todas las sesiones existentes serán invalidadas.

---

## `lek-sessions-storage-sqlite-bun`

Existe un paquete separado que implementa `IStorage` con SQLite, optimizado para el runtime Bun: [`lek-sessions-storage-sqlite-bun`](https://github.com/Gabrielito666/lek-sessions-storage-sqlite-bun).

```bash
npm install lek-sessions-storage-sqlite-bun
```

```javascript
const LekSessions = require("lek-sessions");
const SqliteStorage = require("lek-sessions-storage-sqlite-bun");

const sessions = new LekSessions("clave-secreta", {
	storage: new SqliteStorage("./sessions.db"),
});
```

Este paquete provee almacenamiento persistente sin necesidad de configurar una base de datos externa.

---

## Adaptador Express

`lek-sessions` incluye un wrapper opcional para Express que maneja cookies automáticamente. Ver [`EXPRESS_ADAPTER.md`](./EXPRESS_ADAPTER.md) para la documentación completa.

---

## Licencia

ISC
