const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const MemoryStorage = require('#lib/memory-storage');

const mockSession = (overrides = {}) => ({
	id_session: 'session-1',
	id_subject: 'user-1',
	private_access_key: Buffer.from('private-access'),
	private_refresh_key: Buffer.from('private-refresh'),
	expires_access_token_at: new Date(Date.now() + 1000 * 60 * 60),
	expires_refresh_token_at: new Date(Date.now() + 1000 * 60 * 60 * 24),
	access_max_age: 3600,
	refresh_max_age: 86400,
	revoked: false,
	metadata: undefined,
	...overrides
});

let storage;

afterEach(() =>
{
	if(storage) { storage.close(); storage = null; }
});

describe('constructor', () =>
{
	it('creates with defaults', () =>
	{
		storage = new MemoryStorage();
		assert.ok(storage);
	});

	it('creates with custom options', () =>
	{
		storage = new MemoryStorage({
			delete_on_revoke: false,
			auto_clean_up: false,
			clean_up_interval: 5000
		});
		assert.ok(storage);
	});

	it('auto_clean_up: false does not create timer', () =>
	{
		storage = new MemoryStorage({ auto_clean_up: false });
		storage.close();
	});
});

describe('get', () =>
{
	it('returns undefined for non-existent session', () =>
	{
		storage = new MemoryStorage({ auto_clean_up: false });
		assert.equal(storage.get('non-existent'), undefined);
	});

	it('returns session after set', () =>
	{
		storage = new MemoryStorage({ auto_clean_up: false });
		const session = mockSession();
		storage.set('session-1', session);
		assert.deepEqual(storage.get('session-1'), session);
	});
});

describe('set', () =>
{
	it('stores session', () =>
	{
		storage = new MemoryStorage({ auto_clean_up: false });
		const session = mockSession();
		storage.set('session-1', session);
		assert.deepEqual(storage.get('session-1'), session);
	});

	it('overwrites existing session with same id', () =>
	{
		storage = new MemoryStorage({ auto_clean_up: false });
		const session_1 = mockSession({ metadata: 'first' });
		const session_2 = mockSession({ metadata: 'second' });
		storage.set('session-1', session_1);
		storage.set('session-1', session_2);
		assert.deepEqual(storage.get('session-1'), session_2);
	});
});

describe('delete', () =>
{
	it('removes session', () =>
	{
		storage = new MemoryStorage({ auto_clean_up: false });
		storage.set('session-1', mockSession());
		storage.delete('session-1');
		assert.equal(storage.get('session-1'), undefined);
	});

	it('deleting non-existent session does not throw', () =>
	{
		storage = new MemoryStorage({ auto_clean_up: false });
		assert.doesNotThrow(() => storage.delete('non-existent'));
	});
});

describe('revoke', () =>
{
	it('with delete_on_revoke: true — deletes session', () =>
	{
		storage = new MemoryStorage({ auto_clean_up: false, delete_on_revoke: true });
		storage.set('session-1', mockSession());
		storage.revoke('session-1');
		assert.equal(storage.get('session-1'), undefined);
	});

	it('with delete_on_revoke: false — marks revoked', () =>
	{
		storage = new MemoryStorage({ auto_clean_up: false, delete_on_revoke: false });
		storage.set('session-1', mockSession());
		storage.revoke('session-1');
		const session = storage.get('session-1');
		assert.ok(session);
		assert.equal(session.revoked, true);
	});

	it('revoking non-existent session does not throw', () =>
	{
		storage = new MemoryStorage({ auto_clean_up: false });
		assert.doesNotThrow(() => storage.revoke('non-existent'));
	});
});

describe('close', () =>
{
	it('clears timer', () =>
	{
		storage = new MemoryStorage({ auto_clean_up: true, clean_up_interval: 50 });
		storage.close();
		storage.close();
	});

	it('calling close twice does not throw', () =>
	{
		storage = new MemoryStorage({ auto_clean_up: true });
		assert.doesNotThrow(() => { storage.close(); storage.close(); });
	});
});

describe('clean (indirect)', () =>
{
	it('removes expired sessions', async() =>
	{
		storage = new MemoryStorage({ auto_clean_up: true, clean_up_interval: 50 });
		storage.set('expired', mockSession({
			expires_access_token_at: new Date(Date.now() - 1000),
			expires_refresh_token_at: new Date(Date.now() - 1000)
		}));
		storage.set('valid', mockSession());

		await new Promise(r => setTimeout(r, 100));

		assert.equal(storage.get('expired'), undefined);
		assert.ok(storage.get('valid'));
	});

	it('removes revoked sessions', async() =>
	{
		storage = new MemoryStorage({ auto_clean_up: true, clean_up_interval: 50, delete_on_revoke: false });
		storage.set('revoked', mockSession({ revoked: true }));
		storage.set('valid', mockSession());

		await new Promise(r => setTimeout(r, 100));

		assert.equal(storage.get('revoked'), undefined);
		assert.ok(storage.get('valid'));
	});

	it('keeps valid sessions', async() =>
	{
		storage = new MemoryStorage({ auto_clean_up: true, clean_up_interval: 50 });
		storage.set('valid-1', mockSession());
		storage.set('valid-2', mockSession());

		await new Promise(r => setTimeout(r, 100));

		assert.ok(storage.get('valid-1'));
		assert.ok(storage.get('valid-2'));
	});
});
