/**
 * @import {IStorage, ISession, Metadata} from "#lib/lek-sessions"
 */

/**
 * @typedef {{
 *	delete_on_revoke: boolean;
 *	auto_clean_up: boolean;
 *	clean_up_interval: number;
 * }} MemoryStorageOptions
 */

/**
 * @class
 * @template {Metadata} TMetadata
 * @implements {IStorage<TMetadata>}
 */
const MemoryStorage = class
{
	/**@type {MemoryStorageOptions}*/
	#options;
	/**@type {Map<string, ISession<TMetadata>>}*/
	#map;
	/**@type {NodeJS.Timeout|null}*/
	#clean_up_timer;
	/**
	 * @param {Partial<MemoryStorageOptions>} [options]
	 */
	constructor(options)
	{
		this.#options = {
			delete_on_revoke: true,
			auto_clean_up: true,
			clean_up_interval: 1000 * 60 * 60,	//1 hour
			...options
		};

		this.#map = new Map();

		this.#clean();
		this.#clean_up_timer = null;
		if(this.#options.auto_clean_up)
		{
			this.#clean_up_timer = setInterval(() => this.#clean(), this.#options.clean_up_interval);
		}
	}
	/**@type {IStorage<TMetadata>["get"]}*/
	get(id_session)
	{
		return this.#map.get(id_session);
	}
	/**@type {IStorage<TMetadata>["set"]}*/
	set(id_session, session)
	{
		this.#map.set(id_session, session);
		return void 0;
	}
	/**@type {IStorage<TMetadata>["delete"]}*/
	delete(id_session)
	{
		this.#map.delete(id_session);
		return void 0;
	}
	/**@type {IStorage<TMetadata>["revoke"]}*/
	revoke(id_session)
	{
		if(this.#options.delete_on_revoke) return this.delete(id_session);

		const session = this.#map.get(id_session);
		if(!session) return void 0;

		session.revoked = true;
		return void 0;
	}
	close()
	{
		if(this.#clean_up_timer)
		{
			clearInterval(this.#clean_up_timer);
			this.#clean_up_timer = null;
		}
		this.#clean();
	}
	/**
	 * @returns {void}
	 */
	#clean()
	{
		const now = Date.now();
		for(const [id, session] of this.#map)
		{
			if(
				session.revoked ||
				(
					now > session.expires_access_token_at.getTime() &&
					now > session.expires_refresh_token_at.getTime()
				)
			) this.#map.delete(id);
		}
	}
}
module.exports = MemoryStorage;
