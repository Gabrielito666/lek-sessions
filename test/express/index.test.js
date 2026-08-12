/**
 * @file
 * @source ./test/express/index.test.js
 * @description Tests for lek-sessions/express wrapper — covers constructor, cookie management, delegation, and cookie header parsing
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const LekSessions = require('#lib/lek-sessions');
const LekSessionsExpress = require('#lib/express');

// ── Helpers ──────────────────────────────────────────────

/** @returns {import("#lib/lek-sessions")<Record<string, unknown>>} */
const createMockLekSessions = () =>
{
	const mock = {
		createResult: {
			access_token: 'mock-access-token',
			refresh_token: 'mock-refresh-token',
			expires_access_token_at: new Date(Date.now() + 3600000),
		},
		confirmResult: { success: true, id_subject: 'user-1', metadata: {} },
		refreshResult: {
			success: true,
			access_token: 'new-access-token',
			refresh_token: 'new-refresh-token',
			expires_access_token_at: new Date(Date.now() + 3600000),
		},
		createArgs:   /** @type {{ id_subject: string; options: object }|null}*/ (null),
		confirmToken: /** @type {string|null}*/ (null),
		refreshToken: /** @type {string|null}*/ (null),
		revokeToken:  /** @type {string|null}*/ (null),
		closeCalled: false,

		async create(id_subject, options)
		{
			mock.createArgs = { id_subject, options };

			return mock.createResult;
		},
		async confirm(token)
		{
			mock.confirmToken = token;

			return mock.confirmResult;
		},
		async refresh(token)
		{
			mock.refreshToken = token;

			return mock.refreshResult;
		},
		async revoke(token)
		{
			mock.revokeToken = token;
		},
		async close()
		{
			mock.closeCalled = true;
		},
	};

	return mock;
};

/** @returns {{
 *   cookies: Array<{ name: string; value: string; options: import("express").CookieOptions }>;
 *   cleared: Array<{ name: string; options: import("express").CookieOptions }>;
 *   cookie: (name: string, value: string, options: import("express").CookieOptions) => void;
 *   clearCookie: (name: string, options: import("express").CookieOptions) => void;
 * }} */
const createMockRes = () =>
{
	const res = {
		cookies: [],
		cleared: [],

		/** @type {import("express").Response["cookie"]} */
		cookie(name, value, options)
		{
			this.cookies.push({ name, value, options });
		},

		/** @type {import("express").Response["clearCookie"]} */
		clearCookie(name, options)
		{
			this.cleared.push({ name, options });
		},
	};

	return res;
};

/**
 * @param {string|undefined} cookieString
 * @returns {{ headers: { cookie: string|undefined } }}
 */
const createMockReq = (cookieString) =>
{
	return { headers: { cookie: cookieString } };
};

const MockStorage = class
{
	#map = new Map();
	get(id) { return this.#map.get(id); }
	set(id, session) { this.#map.set(id, session); }
	delete(id) { this.#map.delete(id); }
	revoke(id)
	{
		const session = this.#map.get(id);
		if(!session) return;
		session.revoked = true;
	}
	close() {}
};

// ── Constructor ──────────────────────────────────────────

describe('express-constructor', () =>
{
	it('express-creates instance with required params', () =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);

		assert.ok(wrapper);
	});

	it('express-creates instance with custom options', () =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek, {
			cookie_name: 'my_session',
			httpOnly: false,
			secure: false,
		});

		assert.ok(wrapper);
	});

	it('express-default cookie_name is __app_session__', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const res = createMockRes();

		await wrapper.create(res, 'user-1', { metadata: {} });

		assert.equal(res.cookies[0].name, '__app_session__');
		assert.equal(res.cookies[1].name, '__app_session__' + '_refresh');
	});

	it('express-custom cookie_name is respected', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek, { cookie_name: 'my_app' });
		const res = createMockRes();

		await wrapper.create(res, 'user-1', { metadata: {} });

		assert.equal(res.cookies[0].name, 'my_app');
		assert.equal(res.cookies[1].name, 'my_app' + '_refresh');
	});

	it('express-cookie_name is used by confirm to read access_token', () =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek, { cookie_name: 'x_session' });
		const req = createMockReq('x_session=secret-token; other=ignore');

		wrapper.confirm(req);

		assert.equal(lek.confirmToken, 'secret-token');
	});

	it('express-cookie_name is used by refresh to read refresh_token', () =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek, { cookie_name: 'x_session' });
		const req = createMockReq('x_session_refresh=my-refresh-token');
		const res = createMockRes();

		wrapper.refresh(req, res);

		assert.equal(lek.refreshToken, 'my-refresh-token');
	});

	it('express-httpOnly defaults to true', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const res = createMockRes();

		await wrapper.create(res, 'user-1', { metadata: {} });

		assert.equal(res.cookies[0].options.httpOnly, true);
	});

	it('express-httpOnly can be set to false', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek, { httpOnly: false });
		const res = createMockRes();

		await wrapper.create(res, 'user-1', { metadata: {} });

		assert.equal(res.cookies[0].options.httpOnly, false);
	});
});

// ── NODE_ENV behavior for secure ─────────────────────────

describe('express- secure cookie (NODE_ENV detection)', () =>
{
	/** @type {string|undefined} */
	let originalNodeEnv;

	beforeEach(() =>
	{
		originalNodeEnv = process.env.NODE_ENV;
	});

	afterEach(() =>
	{
		process.env.NODE_ENV = originalNodeEnv;
	});

	it('express-secure defaults to true when NODE_ENV is unset', async() =>
	{
		delete process.env.NODE_ENV;

		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const res = createMockRes();

		await wrapper.create(res, 'user-1', { metadata: {} });

		assert.equal(res.cookies[0].options.secure, true);
	});

	it('express-secure defaults to true when NODE_ENV is production', async() =>
	{
		process.env.NODE_ENV = 'production';

		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const res = createMockRes();

		await wrapper.create(res, 'user-1', { metadata: {} });

		assert.equal(res.cookies[0].options.secure, true);
	});

	it('express-secure defaults to false when NODE_ENV is development', async() =>
	{
		process.env.NODE_ENV = 'development';

		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const res = createMockRes();

		await wrapper.create(res, 'user-1', { metadata: {} });

		assert.equal(res.cookies[0].options.secure, false);
	});

	it('express-secure defaults to false when NODE_ENV is dev', async() =>
	{
		process.env.NODE_ENV = 'dev';

		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const res = createMockRes();

		await wrapper.create(res, 'user-1', { metadata: {} });

		assert.equal(res.cookies[0].options.secure, false);
	});

	it('express-explicit secure option overrides NODE_ENV detection', async() =>
	{
		process.env.NODE_ENV = 'development';

		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek, { secure: true });
		const res = createMockRes();

		await wrapper.create(res, 'user-1', { metadata: {} });

		assert.equal(res.cookies[0].options.secure, true);
	});
});

// ── create ───────────────────────────────────────────────

describe('express-create', () =>
{
	it('express-delegates to sessions.create with id_subject and options', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const res = createMockRes();
		const options = { metadata: { role: 'admin' }, access_max_age: 300 };

		await wrapper.create(res, 'user-42', options);

		assert.deepEqual(lek.createArgs, { id_subject: 'user-42', options });
	});

	it('express-sets access_token cookie with expires', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const res = createMockRes();

		await wrapper.create(res, 'user-1', { metadata: {} });

		assert.equal(res.cookies[0].name, '__app_session__');
		assert.equal(res.cookies[0].value, 'mock-access-token');
		assert.ok(res.cookies[0].options.expires instanceof Date);
	});

	it('express-sets refresh_token cookie without expires', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const res = createMockRes();

		await wrapper.create(res, 'user-1', { metadata: {} });

		assert.equal(res.cookies[1].name, '__app_session__' + '_refresh');
		assert.equal(res.cookies[1].value, 'mock-refresh-token');
		assert.equal(res.cookies[1].options.expires, undefined);
	});

	it('express-access_token cookie uses sameSite strict, path /, configured httpOnly and secure', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek, { httpOnly: false, secure: false });
		const res = createMockRes();

		await wrapper.create(res, 'user-1', { metadata: {} });

		assert.equal(res.cookies[0].options.httpOnly, false);
		assert.equal(res.cookies[0].options.secure, false);
		assert.equal(res.cookies[0].options.sameSite, 'strict');
		assert.equal(res.cookies[0].options.path, '/');
	});

	it('express-returns the result from sessions.create', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const res = createMockRes();

		const result = await wrapper.create(res, 'user-1', { metadata: {} });

		assert.equal(result, lek.createResult);
	});

	it('express-creates session without options when metadata is not typed', async() =>
	{
		const lek = new LekSessions('test-secret', { storage: new MockStorage() });
		const wrapper = new LekSessionsExpress(lek);
		const res = createMockRes();

		const result = await wrapper.create(res, 'user-1');

		assert.equal(typeof result.access_token, 'string');
		assert.equal(typeof result.refresh_token, 'string');
		assert.ok(result.expires_access_token_at instanceof Date);
		assert.equal(res.cookies.length, 2);
	});
});

// ── confirm ──────────────────────────────────────────────

describe('express-confirm', () =>
{
	it('express-extracts access_token from cookie and delegates to sessions.confirm', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('__app_session__=the-access-token');

		await wrapper.confirm(req);

		assert.equal(lek.confirmToken, 'the-access-token');
	});

	it('express-returns invalid-token when cookie header is missing', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq(undefined);

		const result = await wrapper.confirm(req);

		assert.equal(result.success, false);
		assert.equal(result.error_type, 'invalid-token');
	});

	it('express-returns invalid-token when cookie header is empty string', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('');

		const result = await wrapper.confirm(req);

		assert.equal(result.success, false);
		assert.equal(result.error_type, 'invalid-token');
	});

	it('express-returns invalid-token when cookie does not contain expected name', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('other_cookie=some-value');

		const result = await wrapper.confirm(req);

		assert.equal(result.success, false);
		assert.equal(result.error_type, 'invalid-token');
	});

	it('express-does not call sessions.confirm when cookie is missing', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq(undefined);

		await wrapper.confirm(req);

		assert.equal(lek.confirmToken, null);
	});

	it('express-returns success result from sessions.confirm', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('__app_session__=valid-token');

		const result = await wrapper.confirm(req);

		assert.equal(result, lek.confirmResult);
		assert.equal(result.success, true);
	});

	it('express-returns error result from sessions.confirm', async() =>
	{
		const lek = createMockLekSessions();
		lek.confirmResult = { success: false, error_type: 'revoked' };

		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('__app_session__=revoked-token');

		const result = await wrapper.confirm(req);

		assert.equal(result.success, false);
		assert.equal(result.error_type, 'revoked');
	});
});

// ── refresh ──────────────────────────────────────────────

describe('express-refresh', () =>
{
	it('express-extracts refresh_token from cookie and delegates to sessions.refresh', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('__app_session__' + '_refresh=my-refresh-token');
		const res = createMockRes();

		await wrapper.refresh(req, res);

		assert.equal(lek.refreshToken, 'my-refresh-token');
	});

	it('express-returns invalid-token when refresh cookie is missing', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq(undefined);
		const res = createMockRes();

		const result = await wrapper.refresh(req, res);

		assert.equal(result.success, false);
		assert.equal(result.error_type, 'invalid-token');
	});

	it('express-sets new cookies on successful refresh', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('__app_session__' + '_refresh=valid-refresh');
		const res = createMockRes();

		await wrapper.refresh(req, res);

		assert.equal(res.cookies.length, 2);
		assert.equal(res.cookies[0].name, '__app_session__');
		assert.equal(res.cookies[0].value, 'new-access-token');
		assert.equal(res.cookies[1].name, '__app_session__' + '_refresh');
		assert.equal(res.cookies[1].value, 'new-refresh-token');
	});

	it('express-new access_token cookie includes expires', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('__app_session__' + '_refresh=valid-refresh');
		const res = createMockRes();

		await wrapper.refresh(req, res);

		assert.ok(res.cookies[0].options.expires instanceof Date);
	});

	it('express-new refresh_token cookie does not include expires', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('__app_session__' + '_refresh=valid-refresh');
		const res = createMockRes();

		await wrapper.refresh(req, res);

		assert.equal(res.cookies[1].options.expires, undefined);
	});

	it('express-does not set cookies when refresh fails', async() =>
	{
		const lek = createMockLekSessions();
		lek.refreshResult = { success: false, error_type: 'revoked' };

		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('__app_session__' + '_refresh=revoked-refresh');
		const res = createMockRes();

		await wrapper.refresh(req, res);

		assert.equal(res.cookies.length, 0);
	});

	it('express-returns the result from sessions.refresh', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('__app_session__' + '_refresh=valid-refresh');
		const res = createMockRes();

		const result = await wrapper.refresh(req, res);

		assert.equal(result, lek.refreshResult);
	});

	it('express-does not call sessions.refresh when cookie is missing', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq(undefined);
		const res = createMockRes();

		await wrapper.refresh(req, res);

		assert.equal(lek.refreshToken, null);
	});
});

// ── revoke ───────────────────────────────────────────────

describe('express-revoke', () =>
{
	it('express-extracts access_token and delegates to sessions.revoke', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('__app_session__=token-to-revoke');
		const res = createMockRes();

		await wrapper.revoke(req, res);

		assert.equal(lek.revokeToken, 'token-to-revoke');
	});

	it('express-clears both cookies', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('__app_session__=any-token');
		const res = createMockRes();

		await wrapper.revoke(req, res);

		assert.equal(res.cleared.length, 2);
		assert.equal(res.cleared[0].name, '__app_session__');
		assert.equal(res.cleared[1].name, '__app_session__' + '_refresh');
	});

	it('express-clearCookie includes path /', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('__app_session__=any-token');
		const res = createMockRes();

		await wrapper.revoke(req, res);

		assert.deepEqual(res.cleared[0].options, { path: '/' });
		assert.deepEqual(res.cleared[1].options, { path: '/' });
	});

	it('express-clears cookies even when no token is present', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq(undefined);
		const res = createMockRes();

		await wrapper.revoke(req, res);

		assert.equal(res.cleared.length, 2);
	});

	it('express-does not call sessions.revoke when token is missing', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq(undefined);
		const res = createMockRes();

		await wrapper.revoke(req, res);

		assert.equal(lek.revokeToken, null);
	});
});

// ── close ────────────────────────────────────────────────

describe('express-close', () =>
{
	it('express-delegates to sessions.close', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);

		await wrapper.close();

		assert.equal(lek.closeCalled, true);
	});
});

// ── Cookie parsing (indirect via confirm / refresh) ──────

describe('express-cookie parsing (indirect)', () =>
{
	it('express-parses a simple cookie', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('__app_session__=myToken');

		await wrapper.confirm(req);

		assert.equal(lek.confirmToken, 'myToken');
	});

	it('express-parses the correct cookie among multiple', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('other=ignore; __app_session__=real-token; another=skip');

		await wrapper.confirm(req);

		assert.equal(lek.confirmToken, 'real-token');
	});

	it('express-parses cookie with URL-encoded value', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('__app_session__=hello%20world%21');

		await wrapper.confirm(req);

		assert.equal(lek.confirmToken, 'hello world!');
	});

	it('express-handles spaces around cookie name and value', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('  __app_session__  =  spaced-token  ');

		await wrapper.confirm(req);

		assert.equal(lek.confirmToken, 'spaced-token');
	});

	it('express-handles extra spaces after semicolon separator', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('a=1;  __app_session__=found;   b=3');

		await wrapper.confirm(req);

		assert.equal(lek.confirmToken, 'found');
	});

	it('express-handles value containing equals sign', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('__app_session__=abc123=def');

		await wrapper.confirm(req);

		assert.equal(lek.confirmToken, 'abc123=def');
	});

	it('express-handles cookie name with underscore', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek, { cookie_name: 'my_session' });
		const req = createMockReq('my_session=underscore-token');

		await wrapper.confirm(req);

		assert.equal(lek.confirmToken, 'underscore-token');
	});

	it('express-parses refresh_token with custom cookie_name', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek, { cookie_name: 'x' });
		const req = createMockReq('x_refresh=my-refresh-val');
		const res = createMockRes();

		await wrapper.refresh(req, res);

		assert.equal(lek.refreshToken, 'my-refresh-val');
	});

	it('express-skips malformed cookie without name', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('=no-name; __app_session__=good-token');

		await wrapper.confirm(req);

		assert.equal(lek.confirmToken, 'good-token');
	});

	it('express-returns empty object when header is undefined (no error)', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq(undefined);

		const result = await wrapper.confirm(req);

		assert.equal(result.success, false);
		assert.equal(result.error_type, 'invalid-token');
	});

	it('express-returns empty object when header is empty string', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('');

		const result = await wrapper.confirm(req);

		assert.equal(result.success, false);
		assert.equal(result.error_type, 'invalid-token');
	});

	it('express-treats empty cookie value as invalid-token (falsy guard)', async() =>
	{
		const lek = createMockLekSessions();
		const wrapper = new LekSessionsExpress(lek);
		const req = createMockReq('__app_session__=');

		const result = await wrapper.confirm(req);

		assert.equal(result.success, false);
		assert.equal(result.error_type, 'invalid-token');
		assert.equal(lek.confirmToken, null);
	});
});
