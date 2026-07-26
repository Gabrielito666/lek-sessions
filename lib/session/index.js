const { createKeysPair, createToken } = require("#lib/tools");
const Session = class
{
	/**@type {string}*/
	access_token;
	/**@type {string}*/
	refresh_token;
	/**@type {Date}*/
	expires_access_token_at;
	/**@type {Date}*/
	expires_refresh_token_at;
	
	constructor(id_subject)
	{
		const [private_access_key, public_access_key] = createKeysPair();
		const [private_refresh_key, public_refresh_key] = createKeysPair();	
		
		const id_session = "";
		const access_token = createToken(id_session, public_access_key);
		const refresh_token = createToken(id_session, public_refresh_key);

		this.access_token = access_token;
		this.refresh_token = refresh_token;
	}
}

module.exports = Session;
