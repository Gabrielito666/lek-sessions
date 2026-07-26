const { cipher, decipher, encrypt, compare } = require('lek-cryptools');
const { createKeysPair, createToken } = require("#lib/tools");
const crypto = require("crypto");
const MemoryStorage = require("#lib/memory-storage");

/**
 * @typedef {Record<string, string|number|boolean|null|undefined>|undefined} Metadata
 */

/**
 * @template {Metadata} TMetadata
 * @typedef {{
 * 	id_session: string;
 *	id_subject: string;
 *	private_access_key: Buffer;
 *	private_refresh_key: Buffer;
 *	expires_access_token_at: Date;
 *	expires_refresh_token_at: Date;
 *	metadata: TMetadata;
 * }} ISession
 */

/**
 * @template {Metadata} TMetadata
 * @typedef {{
 *	set(id_session: string, session: ISession<TMetadata>):void|Promise<void>;
 *	get(token: string):ISession<TMetadata>|ISession<TMetadata>;
 *	delete(id_session: string):void|Promise<void>;
 * }} IStorage
 */

/**
 * @template {Metadata} TMetadata
 * @typedef {{
 *	storage: IStorage<TMetadata>
 * }} IOptions
 */

/**
 * @template {Metadata} TMetadata
 */
const LekSessions = class
{
	/**@type {string}*/
	#secret_key;
	/**@type {Map<string, string>}*/
	#sessions;
	/**@type {IOptions<TMetadata>}*/
	#options;

	/**
	 * @param {string} secret_key
	 * @param {Partial<IOptions<TMetadata>>} [options]
	 */
	constructor(secret_key, options)
    	{
		this.#secret_key = secret_key;
		this.#sessions = new Map();
		this.#options = {
			storage: /**@type {IStorage<TMetadata>}*/(new MemoryStorage()),
			...options
		};
	}
	/**
	 * @param {string} id_subject
	 * @param {{
	 *	metadata: TMetadata;
	 *	max_age?: number; //in seconds
	 *	refresh_max_age?: number;
	 * }} options
	 * 
	 */
	async create(id_subject, options)
	{
		const max_age_in_milliseconds = 1000 * (options.max_age || 60 * 60 * 24 * 30);
		const refresh_max_age_in_milliseconds = 1000 * (options.refresh_max_age || 60 * 60 * 24 * 365);
		const [private_access_key, public_access_key] = createKeysPair();
		const [private_refresh_key, public_refresh_key] = createKeysPair();

		const id_session = crypto.randomBytes(32);
		const expires_access_token_at = new Date(Date.now() + max_age_in_milliseconds);
		const expires_refresh_token_at = new Date(Date.now() + refresh_max_age_in_milliseconds);

		const access_token = createToken(id_session, public_access_key, this.#secret_key);
		const refresh_token = createToken(id_session, public_refresh_key, this.#secret_key);

		await this.#options.storage.set(id_session.toString("hex"), {
			id_session: id_session.toString("hex"),
			id_subject,
			private_access_key,
			private_refresh_key,
			expires_access_token_at,
			expires_refresh_token_at,
			metadata: options.metadata
		});

		return { access_token, refresh_token, expires_access_token_at };
	};
	/**
	 * @param {string} session_key
	 */
	async confirm(session_key)
	{
            const decrypted = await decipher(session_key, this.#secret_key, "gcm");
            const [id_subject, keyB] = decrypted.split('|');
            if (!id_subject || !keyB) return false;

            const sessionData = this.#sessions.get(id_subject);
            if (!sessionData) return false;

            const { keyA_Encrypted, expiresBool, expiresInt } = sessionData;
            const keyA = await decipher(keyA_Encrypted, this.#secret_key, "gcm");
            const confirmation = await compare(keyA, keyB);

            if (expiresBool)
            {
                const thisMoment = Date.now();
                const isExpired = thisMoment > expiresInt;
                if (isExpired)
                {
                    this.#sessions.delete(id_subject);
                }
                return confirmation && !isExpired ? id_subject : false;
            }

            return confirmation ? id_subject : false;
    };
};

module.exports = LekSessions;
