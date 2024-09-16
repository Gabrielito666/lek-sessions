const { cipher, decipher, encrypt, compare, getUniqueKey} = require('lek-cryptools');
const SqliteExpress = require('sqlite-express');
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
            rows.forEach(({ id_user, session, expiresBool, expiresInt }) =>
            {
                sessions[id_user] = 
                {
                    keyA_Encrypted : session,
                    expiresBool,
                    expiresInt
                }
            });
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
            const keyA = getUniqueKey();
            const keyB = await encrypt(keyA);
            const keyA_Encrypted = await cipher(keyA, secretManaggerKey);
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

            return cipher(id_user + '|' + keyB, secretManaggerKey);
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
            const [id_user, keyB] = (decipher(cookie_key, secretManaggerKey)).split('|');
            if(!id_user || !keyB){
                return false
            }
            const { keyA_Encrypted, expiresBool, expiresInt } = sessions[id_user];
            if(keyA_Encrypted)
            {
                const keyA = decipher(keyA_Encrypted, secretManaggerKey);
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
            return false;
        };
    };
    return { init, create, confirm };
};
module.exports = useLekSessions;