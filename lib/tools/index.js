const lekCryptools = require("lek-cryptools");
const crypto = require("crypto");
/**
 * @returns {[Buffer, string]}
 */
const createKeysPair = () =>
{
	const private_key = crypto.randomBytes(64);
	const public_key = lekCryptools.encryptSync(private_key.toString("hex"));
	return [ private_key, public_key ];
}
/**
 * @param {string} id_session
 * @param {string} public_key
 * @param {string} secret_key
 * @returns {string}
 */
const createToken = (id_session, public_key, secret_key) => lekCryptools.cipherSync(
	`${id_session}|${public_key}`,
	secret_key,
	"gcm"
);
/**
 * @param {string} token
 * @param {string} secret_key
 * @returns {{id_session: string; public_key: string; error: null}|{ error: "INVALID TOKEN!", id_session: null; public_key: null; }}
 */
const parseToken = (token, secret_key) => 
{
	try
	{
		const [id_session, public_key] = lekCryptools.decipherSync(token, secret_key).split("|");
		return { id_session, public_key, error: null }
	}
	catch(err)
	{
		return { error: "INVALID TOKEN!", id_session: null, public_key: null };
	}
}

module.exports = {createKeysPair, createToken, parseToken};
