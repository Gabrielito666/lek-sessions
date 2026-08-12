const { createKeysPair, createToken, parseToken } = require("#lib/tools");
const lekCryptools = require("lek-cryptools");
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
 *	access_max_age: number; //in seconds
 *	refresh_max_age: number; //in seconds
 *	revoked: boolean;
 *	metadata: TMetadata;
 * }} ISession
 */

/**
 * @template {Metadata} TMetadata
 * @typedef {{
 *	set(id_session: string, session: ISession<TMetadata>):void|Promise<void>;
 *	get(id_session: string):ISession<TMetadata>|undefined|Promise<ISession<TMetadata>|undefined>;
 *	revoke(id_session: string):void|Promise<void>;
 *	delete(id_session: string):void|Promise<void>;
 *	close():void|Promise<void>;
 * }} IStorage
 */

/**
 * @template {Metadata} TMetadata
 * @typedef {{
 *	storage: IStorage<TMetadata>;
 *	access_max_age: number; //in seconds
 *	refresh_max_age: number; //in seconds
 * }} IOptions
 */

/**
 * @template {Metadata} TMetadata
 * @typedef {TMetadata extends undefined
 *	? [{ metadata?: TMetadata; access_max_age?: number; refresh_max_age?: number }?]
 *	: [{ metadata: TMetadata; access_max_age?: number; refresh_max_age?: number }]
 * } CreateArgs
 */

/**
 * @template {Metadata} [TMetadata=undefined]
 */
const LekSessions = class
{
	/**@type {string}*/
	#secret_key;
	/**@type {IOptions<TMetadata>}*/
	#options;

	/**
	 * @param {string} secret_key
	 * @param {Partial<IOptions<TMetadata>>} [options]
	 */
	constructor(secret_key, options)
    	{
		this.#secret_key = secret_key;
		this.#options = {
			access_max_age: options?.access_max_age ?? 60 * 60 * 24 * 30,
			refresh_max_age: options?.refresh_max_age ?? 60 * 60 * 24 * 365,
			storage: options?.storage ?? new MemoryStorage(),
		};
	}
	/**
	 * @param {string} id_subject
	 * @param {CreateArgs<TMetadata>} args
	 * @returns {Promise<{ access_token: string; refresh_token: string; expires_access_token_at: Date; }>}
	 */
	async create(id_subject, ...args)
	{
		const [options] = args;
		const access_max_age = (options?.access_max_age ?? this.#options.access_max_age);
		const refresh_max_age = (options?.refresh_max_age ?? this.#options.refresh_max_age)
		const access_max_age_in_milliseconds = 1000 * access_max_age;
		const refresh_max_age_in_milliseconds = 1000 * refresh_max_age;
		const [private_access_key, public_access_key] = createKeysPair();
		const [private_refresh_key, public_refresh_key] = createKeysPair();

		const id_session = crypto.randomBytes(32).toString("hex");
		const expires_access_token_at = new Date(Date.now() + access_max_age_in_milliseconds);
		const expires_refresh_token_at = new Date(Date.now() + refresh_max_age_in_milliseconds);

		const access_token = createToken(id_session, public_access_key, this.#secret_key);
		const refresh_token = createToken(id_session, public_refresh_key, this.#secret_key);

		await this.#options.storage.set(id_session, {
			id_session,
			id_subject,
			private_access_key,
			private_refresh_key,
			expires_access_token_at,
			expires_refresh_token_at,
			access_max_age,
			refresh_max_age,
			revoked: false,
			metadata: /**@type {TMetadata}*/(options?.metadata)
		});

		return { access_token, refresh_token, expires_access_token_at };
	};
	/**
	 * @param {string} access_token
	 * @returns {Promise<{
	 *	success: true;
	 *	id_subject: string;
	 *	metadata: TMetadata;
	 * }|{
	 *	success: false;
	 *	error_type: "invalid-token"|"invalid-session"|"revoked"|"access-expires";
	 * }>}
	 */
	async confirm(access_token)
	{
		const {
			error: access_token_error,
			id_session,
			public_key: public_access_key
		} = parseToken(access_token, this.#secret_key);

		if(access_token_error)
		{
			return { success: false, error_type: "invalid-token" };
		}

		const session = await this.#options.storage.get(id_session);

		if(!session)
		{
			return { success: false, error_type: "invalid-session" };
		}

		if(session.revoked)
		{
			return { success: false, error_type: "revoked" };
		}

		if(Date.now() > session.expires_access_token_at.getTime())
		{
			return { success: false, error_type: "access-expires" };
		}

		const confirmation = await lekCryptools.compare(
			session.private_access_key.toString("hex"),
			public_access_key
		);

		if(!confirmation) return { success: false, error_type: "invalid-token" };

		return { success: true, id_subject: session.id_subject, metadata: session.metadata };
	};
	/**
	 * @param {string} refresh_token
	 * @returns {Promise<{
	 * 	success: true;
	 * 	access_token: string;
	 * 	refresh_token: string;
	 * 	expires_access_token_at: Date;
	 * }|{
	 * 	success: false;
	 * 	error_type: "invalid-token"|"invalid-session"|"revoked"|"refresh-expires";
	 * }>}
	 */
	async refresh(refresh_token)
	{
		const {
			id_session,
			public_key: public_refresh_key,
			error: parseTokenError
		} = parseToken(refresh_token, this.#secret_key);

		if(parseTokenError)
		{
			return { success: false, error_type: "invalid-token" }
		}

		const session = await this.#options.storage.get(id_session);

		if(!session) return { success: false, error_type: "invalid-session" };

		if(session.revoked)
		{
			return { success: false, error_type: "revoked" }
		}

		if(Date.now() > session.expires_refresh_token_at.getTime())
		{
			await this.#options.storage.revoke(id_session);
			return { success: false, error_type: "refresh-expires" };
		}


		const refresh_token_is_valid = await lekCryptools.compare(
			session.private_refresh_key.toString("hex"),
			public_refresh_key
		);

		if(!refresh_token_is_valid)
		{
			await this.#options.storage.revoke(id_session);
			return { success: false, error_type: "invalid-token" };
		}

		//---
		const [new_private_refresh_key, new_public_refresh_key] = createKeysPair();
		const [new_private_access_key, new_public_access_key] = createKeysPair();

		const new_access_token = createToken(id_session, new_public_access_key, this.#secret_key);
		const new_refresh_token = createToken(id_session, new_public_refresh_key, this.#secret_key);

		const access_max_age_in_milliseconds = session.access_max_age * 1000;
		const refresh_max_age_in_milliseconds = session.refresh_max_age * 1000;
		const now = Date.now();

		const new_expires_access_token_at = new Date(now + access_max_age_in_milliseconds);
		const new_expires_refresh_token_at = new Date(now + refresh_max_age_in_milliseconds);

		await this.#options.storage.set(id_session, {
			id_session,
			id_subject: session.id_subject,
			private_access_key: new_private_access_key,
			private_refresh_key: new_private_refresh_key,
			expires_access_token_at: new_expires_access_token_at,
			expires_refresh_token_at: new_expires_refresh_token_at,
			access_max_age: session.access_max_age,
			refresh_max_age: session.refresh_max_age,
			revoked: false,
			metadata: session.metadata
		});

		return {
			success: true,
			access_token: new_access_token,
			refresh_token: new_refresh_token,
			expires_access_token_at: new_expires_access_token_at
		};
	}
	/**
	 * @param {string} access_token
	 * @returns {Promise<void>}
	 */
	async revoke(access_token)
	{
		const parsed = parseToken(access_token, this.#secret_key);
		if(parsed.error) return void 0;

		await this.#options.storage.revoke(parsed.id_session);

		return void 0;
	}

	/**
	 * @returns {Promise<void>}
	 */
	async close()
	{
		await this.#options.storage.close();
	}
};

module.exports = LekSessions;
