const { getUniqueKey, getUniqueKeySync } = require('./lib/tools');
const { cipher, cipherSync } = require('./lib/cipher');
const { decipher, decipherSync } = require('./lib/decipher');
const { encrypt, encryptSync } = require('./lib/encrypt');
const { compare, compareSync } = require('bcryptjs');
const cipherStream = require('./lib/cipherStream');
const decipherStream = require('./lib/decipherStream');
const ERRORS = require('./lib/errors');

module.exports =
{
    getUniqueKey,
    getUniqueKeySync,
    cipher,
    cipherSync,
    decipher,
    decipherSync,
    encrypt,
    encryptSync,
    compare,
    compareSync,
    cipherStream,
    decipherStream,
    LekCryptoolsError : ERRORS.LekCryptoolsError
};