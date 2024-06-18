const { compare, hash, genSalt } = require('bcryptjs');
const { randomBytes, createCipheriv, createDecipheriv, createHash } = require('crypto');
const SqliteExpress = require('sqlite-express');
const getUniqueKey = () => randomBytes(64).toString('hex');
const dbSession = new SqliteExpress(__dirname);

dbSession.defaultOptions.set
({
    key : 'lek-sessions-data',
    table : 'sessions',
    route : 'lek-sessions-data.db',
    columns : { id_user: 'text', session : 'text', expiresBool : 'text', expiresInt : 'integer' },
    logQuery : false,
    processRows : false,
    processColumns : false
});

const getKeyFromSecret = (secretKey) => {
    try
    {
        return createHash('sha256').update(secretKey).digest();
    }
    catch(err)
    {
        throw new Error('error in lek-sessions when trying to encrypt the session key: ' + err.message);
    }
};

const encrypt = (text, secretKey) =>
{
    try
    {
        const key = getKeyFromSecret(secretKey);
        const iv = randomBytes(16);
        const cipher = createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;    
    }
    catch(err)
    {
        throw new Error('error in lek-sessions when trying to encrypt the session key: ' + err.message);
    }
};

const decrypt = (encrypted, secretKey) =>
{
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
    }
    catch(err)
    {
        if(err.message.includes('Invalid initialization vector'))
        {
            throw new Error('THE_STRING_FROM_COOKIE_ARE_NOT_VALID_FORMAT_LEK_SESSION_ERROR')
        }
        throw new Error('error in lek-sessions when trying to decrypt the session key: ' + err.message);
    }
};

const useLekSessions = (secretManaggerKey) =>
{
    const sessions = {};

    /**
     * initialises the system
     */
    const init = async() =>
    {
        try
        {
            dbSession.createDB();
            await dbSession.createTable();
            const rows = await dbSession.select();
            rows.forEach(({ id_user, session }) => { sessions[id_user] = session });
            console.log(rows, sessions)
        }
        catch(err)
        {
            throw new Error('error in lek-sessions when trying to initialise the package: ' + err.message);
        };
    };

    /**
     * this function receives an identifier from the user and returns a string to be inserted in the user's browser via a cookie
     * @param {string} id_user a user identifier
     * @param {number|undefined} max_age an optional parameter allowing to add a maximum age to the session. it can be a number (in seconds) or undefined.
     * @param {boolean} [persist=true] an optional boolean if you want the session to terminate or not if the sever is restarted
     * @returns {string} <cookie_key>
     */
    const create = async (id_user, max_age, persist=true) =>
    {
        try
        {
            const salt = await genSalt(10);
            const keyA = getUniqueKey();
            const keyB = await hash(keyA, salt);
            const keyA_Encrypted = await encrypt(keyA, secretManaggerKey);
            const expiresBool = max_age ? true : false;
            const thisMoment = new Date().getTime();
            const expiresInt = max_age ? thisMoment + (max_age * 1000) : 0;
            sessions[id_user] = { keyA_Encrypted, expiresBool, expiresInt };

            if(persist)
            {
                const existPrev = await dbSession.exist({ where : { id_user } });
                if(existPrev)
                {
                    await dbSession.update
                    ({ update : { session : keyA_Encrypted, expiresBool, expiresInt }, where : { id_user } });
                }
                else
                {
                    await dbSession.insert
                    ({ row : { id_user, session : keyA_Encrypted, expiresBool, expiresInt } });
                }
            };

            return encrypt(id_user + '|' + keyB, secretManaggerKey);
        }
        catch(err)
        {
            throw new Error('error in lek-sessions when trying to create a session: ' + err.message);
        }
    };

    /**
     * Receives a cookie key (return from create) and confirms or denies a session
     * @param {string} cookie_key a cookie key (return from create)
     * @returns {string|false} <confirmation>
     */
    const confirm = async (cookie_key) =>
    {
        try
        {
            const [id_user, keyB] = (decrypt(cookie_key, secretManaggerKey)).split('|');
            if(!id_user || !keyB){
                return false
            }
            const { keyA_Encrypted, expiresBool, expiresInt } = sessions[id_user];
            if(keyA_Encrypted)
            {
                const keyA = decrypt(keyA_Encrypted, secretManaggerKey);
                const confirmation = await compare(keyA, keyB);
                if(expiresBool)
                {
                    const thisMoment = new Date().getTime();
                    const isExpired = (thisMoment > expiresInt);
                    if(isExpired)
                    {
                        delete sessions[id_user];
                        await dbSession.delete({ where : { id_user } });
                    }
                    return (confirmation && isExpired) ? id_user : false;
                }
                else
                {
                    return confirmation ? id_user : false;
                }
            }
            else return false;
        }
        catch(err)
        {
            if(err.message.includes('THE_STRING_FROM_COOKIE_ARE_NOT_VALID_FORMAT_LEK_SESSION_ERROR'))
            {
                return false;
            };
            throw new Error('error in lek-sessions when trying to confirm session: ' + err.message);
        };
    };
    return { init, create, confirm };
};
module.exports = useLekSessions;