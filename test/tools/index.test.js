const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createKeysPair, createToken, parseToken } = require('#lib/tools');

const SECRET = 'test-secret-key';

describe('createKeysPair', () =>
{
	it('returns an array of 2 elements', () =>
	{
		const pair = createKeysPair();
		assert.equal(pair.length, 2);
	});

	it('first element is a Buffer of 64 bytes', () =>
	{
		const [private_key] = createKeysPair();
		assert.ok(Buffer.isBuffer(private_key));
		assert.equal(private_key.length, 64);
	});

	it('second element is a string', () =>
	{
		const [, public_key] = createKeysPair();
		assert.equal(typeof public_key, 'string');
	});

	it('two calls return different results', () =>
	{
		const [private_key_1, public_key_1] = createKeysPair();
		const [private_key_2, public_key_2] = createKeysPair();
		assert.notEqual(private_key_1.toString('hex'), private_key_2.toString('hex'));
		assert.notEqual(public_key_1, public_key_2);
	});
});

describe('createToken', () =>
{
	it('returns a string', () =>
	{
		const token = createToken('session-1', 'pub-key-1', SECRET);
		assert.equal(typeof token, 'string');
	});

	it('different secret_key produces different output', () =>
	{
		const token_1 = createToken('session-1', 'pub-key-1', SECRET);
		const token_2 = createToken('session-1', 'pub-key-1', 'other-secret');
		assert.notEqual(token_1, token_2);
	});

	it('different id_session produces different output', () =>
	{
		const token_1 = createToken('session-1', 'pub-key-1', SECRET);
		const token_2 = createToken('session-2', 'pub-key-1', SECRET);
		assert.notEqual(token_1, token_2);
	});
});

describe('parseToken', () =>
{
	it('valid token returns id_session, public_key and error null', () =>
	{
		const token = createToken('session-1', 'pub-key-1', SECRET);
		const result = parseToken(token, SECRET);
		assert.equal(result.error, null);
		assert.equal(result.id_session, 'session-1');
		assert.equal(result.public_key, 'pub-key-1');
	});

	it('wrong secret_key returns error', () =>
	{
		const token = createToken('session-1', 'pub-key-1', SECRET);
		const result = parseToken(token, 'wrong-secret');
		assert.ok(result.error);
		assert.equal(result.id_session, null);
		assert.equal(result.public_key, null);
	});

	it('invalid token string returns error', () =>
	{
		const result = parseToken('not-a-valid-token', SECRET);
		assert.ok(result.error);
		assert.equal(result.id_session, null);
		assert.equal(result.public_key, null);
	});

	it('empty string returns error', () =>
	{
		const result = parseToken('', SECRET);
		assert.ok(result.error);
		assert.equal(result.id_session, null);
		assert.equal(result.public_key, null);
	});
});

describe('roundtrip', () =>
{
	it('createToken → parseToken recovers id_session and public_key', () =>
	{
		const id_session = 'my-session-id-123';
		const public_key = 'my-public-key-456';
		const token = createToken(id_session, public_key, SECRET);
		const parsed = parseToken(token, SECRET);
		assert.equal(parsed.error, null);
		assert.equal(parsed.id_session, id_session);
		assert.equal(parsed.public_key, public_key);
	});
});
