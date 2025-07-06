const { cipher, decipher, encrypt, compare, getUniqueKey } = require('lek-cryptools');
const SqliteExpress = require('sqlite-express');

/**
 * @typedef {import("./types.d.ts").UseLekSessionsFunction} UseLekSessionsFunction
 * @typedef {import("./types.d.ts").CreateFunction} CreateFunction
 * @typedef {import("./types.d.ts").ConfirmFunction} ConfirmFunction
 * @typedef {import("./types.d.ts").SessionRow} SessionRow
 */

/** @type {UseLekSessionsFunction} */
const useLekSessions = (secretManaggerKey, dirdata = __dirname, dbname = "lek-sessions-data.db") =>
{
    const dbSession = new SqliteExpress(dirdata);

    dbSession.defaultOptions.set({
        key: 'lek-sessions-data',
        table: 'sessions',
        route: dbname,
        columns: {
            id_user: 'text',
            session: 'text',
            expiresBool: 'text',
            expiresInt: 'integer'
        },
        logQuery: false,
        processRows: false,
        processColumns: false
    });

    /** @type {{[key:string]: {keyA_Encrypted: string; expiresBool:boolean; expiresInt: number}}} */
    const sessions = {};

    const init = async () =>
    {
        try
        {
            dbSession.createDB();
            /**@type {SessionRow[]}*/ //@ts-ignore
            const rows = await dbSession.createTable().then(() => dbSession.select());
            rows.forEach(({ id_user, session, expiresBool, expiresInt }) =>
            {
                sessions[id_user] = {
                    keyA_Encrypted: session,
                    expiresBool: expiresBool === "true",
                    expiresInt
                };
            });
        }
        catch (err)
        {
            throw new Error('error in lek-sessions when trying to initialise the package: ' + err.message);
        }
    };

    /** @type {CreateFunction} */
    const create = async (id_user, max_age=365*24*60, persist = true) =>
    {
        try
        {
            await init();
            const keyA = await getUniqueKey();
            const keyB = await encrypt(keyA);
            const keyA_Encrypted = await cipher(keyA, secretManaggerKey, "gcm");
            const expiresBool = !!max_age;
            const thisMoment = Date.now();
            const expiresInt = thisMoment + (max_age * 1000);

            sessions[id_user] = { keyA_Encrypted, expiresBool, expiresInt };

            if (persist)
            {
                const existPrev = await dbSession.exist({ where: { id_user } });
                if (existPrev)
                {
                    await dbSession.update({
                        update: { session: keyA_Encrypted, expiresBool, expiresInt },
                        where: { id_user }
                    });
                }
                else
                {
                    await dbSession.insert({
                        row: { id_user, session: keyA_Encrypted, expiresBool, expiresInt }
                    });
                }
            }

            return cipher(id_user + '|' + keyB, secretManaggerKey, "gcm");
        }
        catch (err)
        {
            throw new Error('error in lek-sessions when trying to create a session: ' + err.message);
        }
    };

    /** @type {ConfirmFunction} */
    const confirm = async (cookie_key) =>
    {
        try
        {
            await init();
            const decrypted = await decipher(cookie_key, secretManaggerKey, "gcm");
            
            const [id_user, keyB] = decrypted.split('|');
            if (!id_user || !keyB) return false;

            const sessionData = sessions[id_user];
            if (!sessionData) return false;

            const { keyA_Encrypted, expiresBool, expiresInt } = sessionData;
            const keyA = await decipher(keyA_Encrypted, secretManaggerKey, "gcm");
            const confirmation = await compare(keyA, keyB);

            if (expiresBool)
            {
                const thisMoment = Date.now();
                const isExpired = thisMoment > expiresInt;
                if (isExpired)
                {
                    delete sessions[id_user];
                    await dbSession.delete({ where: { id_user } });
                }
                return confirmation && !isExpired ? id_user : false;
            }

            return confirmation ? id_user : false;
        }
        catch (err)
        {
            return false;
        }
    };

    return { create, confirm };
};

module.exports = useLekSessions;