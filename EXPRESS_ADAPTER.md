# lek-sessions/express

A thin wrapper around `LekSessions` that handles cookie extraction from `req` and cookie writing to `res`, so you can manage sessions directly in your Express routes without manually reading or setting cookies.

---

## Import

```javascript
const LekSessions = require("lek-sessions");
const LekSessionsExpress = require("lek-sessions/express");
```

## Setup

```javascript
const sessions = new LekSessions("your-secret-key");

const expressSessions = new LekSessionsExpress(sessions, {
	cookie_name: "__app_session__", // optional, default: "__app_session__"
	httpOnly: true,                  // optional, default: true
	secure: undefined,               // optional, default: true (false if NODE_ENV is "dev" or "development")
});
```

### Options

| Option       | Type      | Default                                                     | Description                              |
|--------------|-----------|-------------------------------------------------------------|------------------------------------------|
| `cookie_name`| `string`  | `"__app_session__"`                                         | Name for the access token cookie. The refresh token cookie uses `{cookie_name}_refresh`. |
| `httpOnly`   | `boolean` | `true`                                                      | Sets `httpOnly` flag on session cookies. |
| `secure`     | `boolean` | `true` (except when `NODE_ENV` is `"dev"` or `"development"`) | Sets `secure` flag on session cookies. |

By default `secure` is `true` in production and `false` in development, so localhost works without HTTPS.

---

## Methods

### `create(res, id_subject, options)`

Creates a session and sets the access and refresh cookies on the response.

```javascript
app.post("/login", async(req, res) =>
{
	const result = await expressSessions.create(res, "user-123", {
		metadata: { role: "admin" },
	});

	res.json({ message: "Session created" });
});
```

**Cookies set:**
- `__app_session__` — access token (with `expires`)
- `__app_session___refresh` — refresh token (session cookie, no expires)

---

### `confirm(req)`

Extracts the access token from cookies and verifies it against the session store.

```javascript
app.get("/profile", async(req, res) =>
{
	const result = await expressSessions.confirm(req);

	if(!result.success)
	{
		if(result.error_type === "access-expires")
		{
			return res.status(401).json({ error: "Token expired, refresh needed" });
		}
		return res.status(401).json({ error: result.error_type });
	}

	// result: { success: true, id_subject: string, metadata: TMetadata }
	res.json({ user: result.id_subject, metadata: result.metadata });
});
```

Returns the same shape as `LekSessions.confirm()`. If no cookie is found, returns `{ success: false, error_type: "invalid-token" }` without calling the underlying session store.

---

### `refresh(req, res)`

Extracts the refresh token from cookies and rotates the session. On success, both cookies are updated with new tokens.

```javascript
app.post("/refresh", async(req, res) =>
{
	const result = await expressSessions.refresh(req, res);

	if(!result.success)
	{
		return res.status(401).json({ error: "Session expired, log in again" });
	}

	res.json({ message: "Session refreshed" });
});
```

On success, replaces:
- `__app_session__` cookie with the new access token (with `expires`)
- `__app_session___refresh` cookie with the new refresh token (session cookie)

On failure, no cookies are written and the original error from `LekSessions.refresh()` is returned.

---

### `revoke(req, res)`

Extracts the access token from cookies, revokes the session, and clears both cookies.

```javascript
app.post("/logout", async(req, res) =>
{
	await expressSessions.revoke(req, res);
	res.json({ message: "Logged out" });
});
```

Both cookies are cleared **regardless** of whether a valid token was found. Calling `revoke` on a missing or invalid token is safe (no-op for the session store, cookies still cleared).

---

### `close()`

Delegates to `LekSessions.close()`. Call this when shutting down the application.

```javascript
process.on("SIGTERM", async() =>
{
	await expressSessions.close();
	process.exit(0);
});
```

---

## Cookie behavior

| Aspect | Detail |
|--------|--------|
| **Access cookie name** | `{cookie_name}` (default `__app_session__`) |
| **Refresh cookie name** | `{cookie_name}_refresh` (default `__app_session___refresh`) |
| **Access cookie expires** | Set to `expires_access_token_at` from the session |
| **Refresh cookie expires** | Not set (session cookie) |
| **`httpOnly`** | Configurable, default `true` |
| **`secure`** | Configurable, auto-detects dev environment |
| **`sameSite`** | Always `"strict"` |
| **`path`** | Always `"/"` |
| **Cookie parsing** | Built-in (no `cookie-parser` dependency) |

## Error types

See [README.md](./README.md) for the full list of error types returned by `confirm()` and `refresh()`. The Express adapter does not introduce new error types.
