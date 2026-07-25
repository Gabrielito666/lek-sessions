const { cipher, decipher, encrypt, compare, getUniqueKey } = require('lek-cryptools');

const useLekSessions = (secretManaggerKey, dirdata = __dirname, dbname = "lek-sessions-data.db") =>
{
    /** @type {{[key:string]: {keyA_Encrypted: string; expiresBool:boolean; expiresInt: number}}} */
    const sessions = {};

    const create = async (id_user, max_age=365*24*60, persist=true) =>
    {
            const keyA = await getUniqueKey();
            const keyB = await encrypt(keyA);
            const keyA_Encrypted = await cipher(keyA, secretManaggerKey, "gcm");
            const expiresBool = !!max_age;
            const thisMoment = Date.now();
            const expiresInt = thisMoment + (max_age * 1000);

            sessions[id_user] = { keyA_Encrypted, expiresBool, expiresInt };

            return cipher(id_user + '|' + keyB, secretManaggerKey, "gcm");
    };

    const confirm = async (cookie_key) =>
    {
        try
        {
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
                }
                return confirmation && !isExpired ? id_user : false;
            }

            return confirmation ? id_user : false;
        catch (err)
        {
            return false;
        }
    };

    return { create, confirm };
};

module.exports = useLekSessions;
