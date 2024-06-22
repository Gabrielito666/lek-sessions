const { compare, hash, genSalt } = require('bcryptjs');
const { randomBytes, createCipheriv, createDecipheriv, createHash } = require('crypto');

/**
 * function that generates a unique key for magic-link or id for some item
 * @param {number} [num=64] length of unique key 
 * @returns {string} the unique key
*/
const getUniqueKey = (num=64) => randomBytes(num).toString('hex');

/**
 * encrypt a key
 * @param {string} data string to encrypt
 * @param {number} [num=10] number from salt
 * @returns {string} a hash
*/
const encrypt = async(data, num=10) => hash(data, await genSalt(num));

/**
 * with this function a key to the secret is obtained.
 * @param {string} secretKey yor secret key 
 * @returns {string} a hash
*/
const getKeyFromSecret = (secretKey) =>
{
    try
    {
        return createHash('sha256').update(secretKey).digest();
    }
    catch(err)
    {
        throw new Error('error in lek-cryptools when trying to encrypt the key: ' + err.message);
    }
};

/**
 * function to encrypt a string or buffer
 * @param {string|Buffer} data string or buffer to cipher
 * @param {string} secretKey secret key to decipher later
 * @returns {string|Buffer} ciphred data
*/
const cipher = (data, secretKey) => {
    try {
        const key = getKeyFromSecret(secretKey);
        const iv = randomBytes(16);
        const cipher = createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(data, Buffer.isBuffer(data) ? undefined : 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    } catch (err) {
        throw new Error('error in lek-cryptools when trying to encrypt the key: ' + err.message);
    }
};

/**
 * function to decrypt a string or buffer
 * @param {string|Buffer} encrypted pre-ciphred data
 * @param {string} secretKey key to decipher
 * @returns {string|buffer} data
*/
const decipher = (encrypted, secretKey) => {
    try
    {
        const key = getKeyFromSecret(secretKey);
        const parts = encrypted.split(':');
        const iv = Buffer.from(parts.shift(), 'hex');
        const encryptedText = parts.join(':');
        const decipher = createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err)
    {
        throw new Error('error in lek-cryptools when trying to decrypt the key: ' + err.message);
    }
};
module.exports = { getUniqueKey, cipher, decipher, encrypt, compare };
