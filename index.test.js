// index.tests.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const useLekSessions = require('./index.js');
const cryptools = require('lek-cryptools');

const TMP_DIR = path.join(__dirname, 'tmp_tests');
const DB_NAME = 'test.db';
const dbPath = path.join(TMP_DIR, DB_NAME);
const SECRET = 'my-secret-key';

const delay = ms => new Promise(r => setTimeout(r, ms));

const cleanDB = () => {
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true });
};

async function runTests() {
  console.log('Running lek-sessions tests...');
  cleanDB();
  fs.mkdirSync(TMP_DIR, { recursive: true });

  let lek = useLekSessions(SECRET, TMP_DIR, DB_NAME);

  // Test: create and confirm session
  {
    const cookie = await lek.create('user123');
    const result = await lek.confirm(cookie);
    assert.strictEqual(result, 'user123', 'should confirm session');
    console.log('✔ session created and confirmed');
  }

  // Test: invalid cookie
  {
    const result = await lek.confirm('invalid-cookie');
    assert.strictEqual(result, false, 'should return false for invalid cookie');
    console.log('✔ invalid cookie rejected');
  }

  // Test: tampered cookie
  {
    const cookie = await lek.create('user123');
    const tampered = cookie.slice(0, -1) + 'x';
    const result = await lek.confirm(tampered);
    assert.strictEqual(result, false, 'should reject tampered cookie');
    console.log('✔ tampered cookie rejected');
  }

  // Test: session expiration
  {
    const cookie = await lek.create('expiringUser', 0.001);
    await delay(10);
    const result = await lek.confirm(cookie);
    assert.strictEqual(result, false, 'should expire session');
    console.log('✔ session expired as expected');
  }

  // Test: persistence after reload
  {
    const cookie = await lek.create('persistentUser', 60, true);
    lek = useLekSessions(SECRET, TMP_DIR, DB_NAME);
    const result = await lek.confirm(cookie);
    assert.strictEqual(result, 'persistentUser', 'should persist session to DB');
    console.log('✔ session persisted and restored');
  }

  // Test: overwrite session
  {
    const cookie1 = await lek.create('duplicateUser');
    const cookie2 = await lek.create('duplicateUser');
    assert.notStrictEqual(cookie1, cookie2, 'cookies should differ');
    const result = await lek.confirm(cookie2);
    assert.strictEqual(result, 'duplicateUser', 'should confirm overwritten session');
    console.log('✔ session overwritten correctly');
  }

  // Test: persist=false should not restore
  {
    const cookie = await lek.create('memUser', 60, false);
    lek = useLekSessions(SECRET, TMP_DIR, DB_NAME);
    const result = await lek.confirm(cookie);
    assert.strictEqual(result, false, 'should not restore non-persisted session');
    console.log('✔ memory-only session not restored');
  }

  // Test: corrupted session data (real corruption)
  {
    const cookie = await lek.create('user123');
    const mid = Math.floor(cookie.length / 2);
    const corrupted = cookie.slice(0, mid) + 'X' + cookie.slice(mid + 1);
    const result = await lek.confirm(corrupted);
    assert.strictEqual(result, false, 'should reject corrupted session');
    console.log('✔ corrupted session rejected');
  }

  // Test: forged session for unknown user
  {
    const cookie = await lek.create('user123');
    const decrypted = await cryptools.decipher(cookie, SECRET, "gcm");
    const [_id, keyB] = decrypted.split('|');
    const forged = await cryptools.cipher('unknownUser|' + keyB, SECRET);
    const result = await lek.confirm(forged);
    assert.strictEqual(result, false, 'should reject forged session');
    console.log('✔ forged session for unknown user rejected');
  }

  // Test: corruption at the end (GCM should reject)
  {
    const cookie = await lek.create('user123');
    const corrupted = cookie + 'x';
    const result = await lek.confirm(corrupted);
    console.log(result);
    assert.strictEqual(result, false, 'should reject corrupted session with trailing char');
    console.log('✔ corrupted cookie with trailing character rejected (GCM integrity check)');
  }
  
  cleanDB();
  console.log('\n✅ All tests passed.');
}

runTests().catch(err => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
