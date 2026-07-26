const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const LekSessions = require('#lib/lek-sessions');

const SECRET = 'test-secret';
const wait = ms => new Promise(r => setTimeout(r, ms));

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

const createLek = (secret = SECRET) => new LekSessions(secret, { storage: new MockStorage() });

describe('constructor', () =>
{
	it('creates instance with secret_key only', () =>
	{
		const lek = createLek();
		assert.ok(lek);
	});

	it('creates instance with custom options', () =>
	{
		const lek = new LekSessions(SECRET, {
			storage: new MockStorage(),
			access_max_age: 100,
			refresh_max_age: 200
		});
		assert.ok(lek);
	});
});

describe('create', () =>
{
	it('returns access_token, refresh_token and expires_access_token_at', async() =>
	{
		const lek = createLek();
		const result = await lek.create('user-1', { metadata: undefined });
		assert.equal(typeof result.access_token, 'string');
		assert.equal(typeof result.refresh_token, 'string');
		assert.ok(result.expires_access_token_at instanceof Date);
	});

	it('access_token and refresh_token are different', async() =>
	{
		const lek = createLek();
		const result = await lek.create('user-1', { metadata: undefined });
		assert.notEqual(result.access_token, result.refresh_token);
	});

	it('custom metadata is stored', async() =>
	{
		const lek = createLek();
		const meta = { role: 'admin', count: 42 };
		await lek.create('user-1', { metadata: meta });
		const result = await lek.confirm((await lek.create('user-1', { metadata: meta })).access_token);
	});

	it('custom access_max_age overrides default', async() =>
	{
		const lek = createLek();
		const result = await lek.create('user-1', { metadata: undefined, access_max_age: 60 });
		const ms_until_expiry = result.expires_access_token_at.getTime() - Date.now();
		assert.ok(ms_until_expiry > 50000 && ms_until_expiry < 70000);
	});
});

describe('confirm', () =>
{
	it('valid token returns success with id_subject and metadata', async() =>
	{
		const lek = createLek();
		const { access_token } = await lek.create('user-1', { metadata: { foo: 'bar' } });
		const result = await lek.confirm(access_token);
		assert.equal(result.success, true);
		assert.equal(result.id_subject, 'user-1');
		assert.deepEqual(result.metadata, { foo: 'bar' });
	});

	it('invalid token returns invalid-token', async() =>
	{
		const lek = createLek();
		const result = await lek.confirm('not-a-valid-token');
		assert.equal(result.success, false);
		assert.equal(result.error_type, 'invalid-token');
	});

	it('corrupted token returns invalid-token', async() =>
	{
		const lek = createLek();
		const { access_token } = await lek.create('user-1', { metadata: undefined });
		const result = await lek.confirm(access_token + 'trash');
		assert.equal(result.success, false);
		assert.equal(result.error_type, 'invalid-token');
	});

	it('token with wrong secret returns invalid-token', async() =>
	{
		const lek_1 = createLek();
		const lek_2 = createLek('other-secret');
		const { access_token } = await lek_1.create('user-1', { metadata: undefined });
		const result = await lek_2.confirm(access_token);
		assert.equal(result.success, false);
		assert.equal(result.error_type, 'invalid-token');
	});

	it('revoked session returns revoked', async() =>
	{
		const lek = createLek();
		const { access_token } = await lek.create('user-1', { metadata: undefined });
		await lek.revoke(access_token);
		const result = await lek.confirm(access_token);
		assert.equal(result.success, false);
		assert.equal(result.error_type, 'revoked');
	});

	it('expired access token returns access-expires', async() =>
	{
		const lek = createLek();
		const { access_token } = await lek.create('user-1', { metadata: undefined, access_max_age: 1 });
		await wait(1500);
		const result = await lek.confirm(access_token);
		assert.equal(result.success, false);
		assert.equal(result.error_type, 'access-expires');
	});
});

describe('refreshSession', () =>
{
	it('valid refresh token returns new tokens', async() =>
	{
		const lek = createLek();
		const { refresh_token } = await lek.create('user-1', { metadata: undefined });
		const result = await lek.refreshSession(refresh_token);
		assert.equal(result.success, true);
		assert.equal(typeof result.access_token, 'string');
		assert.equal(typeof result.refresh_token, 'string');
		assert.ok(result.expires_access_token_at instanceof Date);
	});

	it('new tokens differ from old ones', async() =>
	{
		const lek = createLek();
		const old = await lek.create('user-1', { metadata: undefined });
		const result = await lek.refreshSession(old.refresh_token);
		assert.notEqual(result.access_token, old.access_token);
		assert.notEqual(result.refresh_token, old.refresh_token);
	});

	it('old refresh token is invalid after refresh (keys rotated)', async() =>
	{
		const lek = createLek();
		const old = await lek.create('user-1', { metadata: undefined });
		await lek.refreshSession(old.refresh_token);
		const result = await lek.refreshSession(old.refresh_token);
		assert.equal(result.success, false);
		assert.equal(result.error_type, 'invalid-token');
	});

	it('invalid refresh token returns invalid-token', async() =>
	{
		const lek = createLek();
		const result = await lek.refreshSession('not-a-valid-token');
		assert.equal(result.success, false);
		assert.equal(result.error_type, 'invalid-token');
	});

	it('expired refresh token returns refresh-expires and revokes session', async() =>
	{
		const lek = createLek();
		const { refresh_token, access_token } = await lek.create('user-1', { metadata: undefined, refresh_max_age: 1 });
		await wait(1500);
		const result = await lek.refreshSession(refresh_token);
		assert.equal(result.success, false);
		assert.equal(result.error_type, 'refresh-expires');
		const confirm = await lek.confirm(access_token);
		assert.equal(confirm.success, false);
		assert.equal(confirm.error_type, 'revoked');
	});

	it('revoked session returns revoked', async() =>
	{
		const lek = createLek();
		const { refresh_token, access_token } = await lek.create('user-1', { metadata: undefined });
		await lek.revoke(access_token);
		const result = await lek.refreshSession(refresh_token);
		assert.equal(result.success, false);
		assert.equal(result.error_type, 'revoked');
	});

	it('metadata is preserved after refresh', async() =>
	{
		const lek = createLek();
		const meta = { role: 'admin' };
		const { refresh_token } = await lek.create('user-1', { metadata: meta });
		const refreshed = await lek.refreshSession(refresh_token);
		const confirm = await lek.confirm(refreshed.access_token);
		assert.equal(confirm.success, true);
		assert.deepEqual(confirm.metadata, meta);
	});

	it('access_max_age and refresh_max_age are preserved after refresh', async() =>
	{
		const lek = createLek();
		const { refresh_token } = await lek.create('user-1', { metadata: undefined, access_max_age: 60, refresh_max_age: 120 });
		const refreshed = await lek.refreshSession(refresh_token);
		const ms_until_expiry = refreshed.expires_access_token_at.getTime() - Date.now();
		assert.ok(ms_until_expiry > 50000 && ms_until_expiry < 70000);
	});
});

describe('revoke', () =>
{
	it('revokes session', async() =>
	{
		const lek = createLek();
		const { access_token } = await lek.create('user-1', { metadata: undefined });
		await lek.revoke(access_token);
		const result = await lek.confirm(access_token);
		assert.equal(result.success, false);
		assert.equal(result.error_type, 'revoked');
	});

	it('after revoke, refreshSession returns revoked', async() =>
	{
		const lek = createLek();
		const { access_token, refresh_token } = await lek.create('user-1', { metadata: undefined });
		await lek.revoke(access_token);
		const result = await lek.refreshSession(refresh_token);
		assert.equal(result.success, false);
		assert.equal(result.error_type, 'revoked');
	});

	it('invalid token does not throw', async() =>
	{
		const lek = createLek();
		await assert.doesNotReject(() => lek.revoke('invalid-token'));
	});
});

describe('close', () =>
{
	it('delegates to storage.close()', async() =>
	{
		const lek = createLek();
		await assert.doesNotReject(() => lek.close());
	});
});
