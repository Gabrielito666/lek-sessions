/**
 * @file
 * @source ./lib/express/index.js
 * @description Express wrapper for lek-sessions — composes a LekSessions instance to provide cookie-based session management
 */

/**
 * @import { Request, Response } from "express"
 */

/**
 * @typedef {{
 *   cookie_name?: string | undefined;
 *   httpOnly?: boolean | undefined;
 *   secure?: boolean | undefined;
 * }} LekSessionsExpressOptions
 */

/**
 * @template {import("#lib/lek-sessions").Metadata} TMetadata
 */
const LekSessionsExpress = class
{
	/** @type {import("#lib/lek-sessions")<TMetadata>} */
	#sessions;
	/** @type {string} */
	#cookie_name;
	/** @type {boolean} */
	#cookie_httpOnly;
	/** @type {boolean} */
	#cookie_secure;

	/**
	 * @param {import("#lib/lek-sessions")<TMetadata>} sessions - Instancia de LekSessions ya configurada
	 * @param {LekSessionsExpressOptions} [options]
	 */
	constructor(sessions, options)
	{
		const isDev = /^dev(elopment)?$/.test(process.env.NODE_ENV ?? "");

		this.#sessions = sessions;
		this.#cookie_name     = options?.cookie_name ?? "__app_session__";
		this.#cookie_httpOnly = options?.httpOnly    ?? true;
		this.#cookie_secure   = options?.secure      ?? !isDev;
	}

	/**
	 * @param {Response} res
	 * @param {string} id_subject
	 * @param {{
	 *   metadata: TMetadata;
	 *   access_max_age?: number;
	 *   refresh_max_age?: number;
	 * }} options
	 * @returns {Promise<{
	 *   access_token: string;
	 *   refresh_token: string;
	 *   expires_access_token_at: Date;
	 * }>}
	 */
	async create(res, id_subject, options)
	{
		const result = await this.#sessions.create(id_subject, options);

		this.#setCookie(
			res,
			this.#cookie_name,
			result.access_token,
			result.expires_access_token_at
		);
		this.#setCookie(
			res,
			this.#cookie_name + "_refresh",
			result.refresh_token
		);

		return result;
	}

	/**
	 * @param {Request} req
	 * @returns {Promise<{
	 *   success: true;
	 *   id_subject: string;
	 *   metadata: TMetadata;
	 * }|{
	 *   success: false;
	 *   error_type: "invalid-token"|"invalid-session"|"revoked"|"access-expires";
	 * }>}
	 */
	async confirm(req)
	{
		const cookies = this.#parseCookies(req);
		const access_token = cookies[this.#cookie_name];

		if(!access_token)
		{
			return { success: false, error_type: "invalid-token" };
		}

		return this.#sessions.confirm(access_token);
	}

	/**
	 * @param {Request} req
	 * @param {Response} res
	 * @returns {Promise<{
	 *   success: true;
	 *   access_token: string;
	 *   refresh_token: string;
	 *   expires_access_token_at: Date;
	 * }|{
	 *   success: false;
	 *   error_type: "invalid-token"|"invalid-session"|"revoked"|"refresh-expires";
	 * }>}
	 */
	async refresh(req, res)
	{
		const cookies = this.#parseCookies(req);
		const refresh_token = cookies[this.#cookie_name + "_refresh"];

		if(!refresh_token)
		{
			return { success: false, error_type: "invalid-token" };
		}

		const result = await this.#sessions.refresh(refresh_token);

		if(result.success)
		{
			this.#setCookie(
				res,
				this.#cookie_name,
				result.access_token,
				result.expires_access_token_at
			);
			this.#setCookie(
				res,
				this.#cookie_name + "_refresh",
				result.refresh_token
			);
		}

		return result;
	}

	/**
	 * @param {Request} req
	 * @param {Response} res
	 * @returns {Promise<void>}
	 */
	async revoke(req, res)
	{
		const cookies = this.#parseCookies(req);
		const access_token = cookies[this.#cookie_name];

		if(access_token)
		{
			await this.#sessions.revoke(access_token);
		}

		this.#clearCookie(res, this.#cookie_name);
		this.#clearCookie(res, this.#cookie_name + "_refresh");
	}

	/**
	 * @returns {Promise<void>}
	 */
	async close()
	{
		await this.#sessions.close();
	}

	/**
	 * @param {Request} req
	 * @returns {Record<string, string>}
	 */
	#parseCookies(req)
	{
		/** @type {Record<string, string>} */
		const cookies = {};
		const cookieHeader = req.headers.cookie;

		if(!cookieHeader) return cookies;

		for(const pair of cookieHeader.split(";"))
		{
			const eqIdx = pair.indexOf("=");
			if(eqIdx < 1) continue;

			const name  = pair.slice(0, eqIdx).trim();
			const value = pair.slice(eqIdx + 1).trim();

			if(name)
			{
				cookies[name] = decodeURIComponent(value);
			}
		}

		return cookies;
	}

	/**
	 * @param {Response} res
	 * @param {string} name
	 * @param {string} value
	 * @param {Date} [expires]
	 * @returns {void}
	 */
	#setCookie(res, name, value, expires)
	{
		/** @type {import("express").CookieOptions} */
		const options = {
			httpOnly: this.#cookie_httpOnly,
			secure:   this.#cookie_secure,
			sameSite: "strict",
			path:     "/",
		};

		if(expires)
		{
			options.expires = expires;
		}

		res.cookie(name, value, options);
	}

	/**
	 * @param {Response} res
	 * @param {string} name
	 * @returns {void}
	 */
	#clearCookie(res, name)
	{
		res.clearCookie(name, { path: "/" });
	}
};

module.exports = LekSessionsExpress;
