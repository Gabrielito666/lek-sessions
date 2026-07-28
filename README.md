# LEK-SESSIONS v3.0.0

Session management system with token rotation and interchangeable storage for Node.js.

---

## Introduction

`lek-sessions` is a library that implements a session system based on **dual-token**: each session generates an `access_token` + `refresh_token` pair. The access_token is used to confirm requests; the refresh_token allows rotating the session and obtaining a new pair.

The cryptographic scheme works as follows:

- When creating a session, two key pairs are generated (one for access, one for refresh).
- Each private key is a random 64-byte buffer.
- Each public key is the hash (bcrypt) of its respective private key.
- The hash travels inside the token encrypted with AES-GCM.
- To confirm, the token is decrypted, the hash is obtained, and it is compared against the stored private key using `bcrypt.compare`.

**Version 3.0.0** introduces an `IStorage` contract that allows injecting any storage backend (memory, SQLite, Redis, PostgreSQL, file, etc.) without modifying the library core.

---

## Installation

```bash
npm install lek-sessions
```

**Requirements:**
- Node.js 20 or higher (uses `node:test`, native `crypto`)

---

## Basic usage

```javascript
const LekSessions = require("lek-sessions");
const MemoryStorage = require("lek-sessions/memory-storage");

const sessions = new LekSessions("my-very-secure-secret-key", {
	storage: new MemoryStorage(),
	access_max_age: 60 * 60 * 24 * 7,    // 7 days
	refresh_max_age: 60 * 60 * 24 * 30,  // 30 days
});

// Create session
const result = await sessions.create("user-123", {
	metadata: { role: "admin" }
});
// result: { access_token, refresh_token, expires_access_token_at }

// Confirm access_token
const confirmation = await sessions.confirm(access_token);
// confirmation.success === true  → { success, id_subject, metadata }
// confirmation.success === false → { success, error_type }

// Refresh session
const refreshed = await sessions.refresh(refresh_token);
// refreshed: { access_token, refresh_token, expires_access_token_at }

// Revoke session
await sessions.revoke(access_token);

// Close storage (frees resources, timers, etc.)
await sessions.close();
```

---

## Method API

### `constructor`

```javascript
/**
 * @param {string} secret_key
 * @param {Partial<IOptions>} [options]
 */
new LekSessions(secret_key, options?)
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `secret_key` | `string` | Server secret key used to encrypt tokens |
| `options` | `Partial<IOptions>` | Optional. Instance configuration |

**Options (`IOptions`):**

| Property | Type | Default | Description |
|-----------|------|---------|-------------|
| `storage` | `IStorage` | `new MemoryStorage()` | Storage implementation |
| `access_max_age` | `number` | 2592000 (30 days) | Access_token TTL in seconds |
| `refresh_max_age` | `number` | 31536000 (365 days) | Refresh_token TTL in seconds |

**Example:**

```javascript
const sessions = new LekSessions("secret-key", {
	access_max_age: 3600, // 1 hour
	refresh_max_age: 86400 * 7, // 7 days
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

Creates a new session for a subject (`id_subject`). Generates one key pair for access and another for refresh, creates the tokens, and stores the session.

**Example:**

```javascript
const session = await sessions.create("user-42", {
	metadata: { ip: "192.168.1.1", userAgent: "Mozilla/..." },
	access_max_age: 300, // 5 minutes for this particular session
});

// Save tokens to send to the client
res.cookie("access_token", session.access_token, {
	httpOnly: true,
	secure: true,
	expires: session.expires_access_token_at
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

Verifies that an `access_token` is valid. Decrypts the token, looks up the session in storage, checks that it is not revoked or expired, and verifies that the stored private key corresponds to the hash included in the token.

**Example:**

```javascript
const result = await sessions.confirm(token);

if(!result.success)
{
	if(result.error_type === "invalid-token") return res.status(401).send("Invalid token");
	if(result.error_type === "revoked") return res.status(401).send("Session revoked");
	if(result.error_type === "access-expires") return res.status(401).send("Token expired, use refresh");
	if(result.error_type === "invalid-session") return res.status(401).send("Session not found");
}

console.log("User:", result.id_subject);
console.log("Metadata:", result.metadata);
// Continue with the request
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

Rotates a complete session: verifies the refresh_token, invalidates the previous keys, generates a new key pair (access + refresh), creates new tokens, and updates the session in storage.

**Important:** each refresh_token can only be used once. If you try to use it again, the method detects that the keys do not match and returns `invalid-token`.

**Example:**

```javascript
const refreshed = await sessions.refresh(refresh_token);

if(refreshed.success)
{
	// Replace cookies with the new tokens
	res.cookie("access_token", refreshed.access_token, {
		httpOnly: true,
		secure: true,
		expires: refreshed.expires_access_token_at
	});
	res.cookie("refresh_token", refreshed.refresh_token, {
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

Revokes the session associated with the `access_token`. Extracts the `id_session` from the token and calls `storage.revoke()`. If the token is invalid, the operation is a no-op (does not throw).

**Example:**

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

Closes the storage, freeing resources such as cleanup timers, database connections, etc. Should always be called when shutting down the application.

**Example:**

```javascript
process.on("SIGTERM", async() =>
{
	await sessions.close();
	process.exit(0);
});
```

---

## Storage system (`IStorage`)

`LekSessions` does not store sessions directly. It delegates this responsibility to an implementation of the `IStorage` contract. This allows using any backend without modifying the core.

The default storage is `MemoryStorage`, which keeps sessions in an in-memory `Map`. **It is not persistent**: sessions are lost when the process restarts.

### `IStorage` contract

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

| Method | Description |
|--------|-------------|
| `set(id_session, session)` | Saves or updates a session |
| `get(id_session)` | Retrieves a session by its ID |
| `revoke(id_session)` | Marks a session as revoked |
| `delete(id_session)` | Removes a session from storage |
| `close()` | Frees resources (connections, timers, etc.) |

Each method can be synchronous or asynchronous (`void` or `Promise<void>`).

### How to implement a custom storage

To create your own storage, import the types from `lek-sessions` and use `@implements` on your class:

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

Then inject it into the constructor:

```javascript
const sessions = new LekSessions("secret-key", {
	storage: new MyStorage()
});
```

---

## Included `MemoryStorage`

`MemoryStorage` is the default implementation. It stores sessions in an in-memory `Map`.

### Options

| Property | Type | Default | Description |
|-----------|------|---------|-------------|
| `delete_on_revoke` | `boolean` | `true` | If `true`, removes the Map entry on revoke. If `false`, only sets `revoked: true` |
| `auto_clean_up` | `boolean` | `true` | Activates a timer that automatically cleans expired sessions |
| `clean_up_interval` | `number` | `3600000` (1 hour) | Cleanup timer interval in milliseconds |

### Cleanup behavior

The internal `#clean()` method iterates through the Map and removes sessions that meet any of these conditions:

- Are marked as `revoked: true`.
- Both tokens (access and refresh) have expired.

### Example with custom options

```javascript
const MemoryStorage = require("lek-sessions/memory-storage");
const storage = new MemoryStorage({
	delete_on_revoke: false,     // Keep a record of revoked sessions
	auto_clean_up: true,
	clean_up_interval: 60000     // Clean every minute
});
```

---

## Error codes

The `confirm` and `refresh` methods return an object with `success: false` and an `error_type` indicating the reason for rejection.

| error_type | Method | Meaning |
|------------|--------|---------|
| `invalid-token` | confirm, refresh | The token is malformed, corrupted, altered, or the wrong `secret_key` was used. Also occurs in `refresh` when trying to reuse an already rotated refresh_token |
| `invalid-session` | confirm, refresh | The `id_session` extracted from the token does not exist in storage (may have been externally removed) |
| `revoked` | confirm, refresh | The session was revoked via `revoke()` |
| `access-expires` | confirm | The access_token has expired according to its expiration date. The session is still active if the refresh_token has not expired |
| `refresh-expires` | refresh | The refresh_token has expired. The session is automatically revoked when this condition is detected |

---

## Migration from v1

| v1 | v3 |
|----|----|
| `useLekSessions(config)` (async) | `new LekSessions(secret_key, options)` (sync) |
| Fixed storage (not configurable) | Injectable storage via `IStorage` |
| No session metadata | Support for generic `metadata` |
| Old token format | Tokens incompatible with v1 (new cipher in `lek-cryptools`) |

**Important:** tokens generated with v1 are not compatible with v3. When migrating, all existing sessions will be invalidated.

---

## Coming soon: `lek-sessions-sqlite-bun`

A separate package is being developed that implements `IStorage` with SQLite, optimized for the Bun runtime.

This package will be published independently and will allow using `lek-sessions` with persistent storage without needing to set up an external database.

---

## License

ISC
