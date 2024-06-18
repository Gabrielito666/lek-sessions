```
# Lek Sessions

Lek Sessions is a personalized and secure session management and storage system. It uses cryptographic techniques to protect session keys and ensures that only authorized developers can access the necessary keys for session verification.

## Basic Operation

1. **Key Generation**: A unique hexadecimal key (`clave_A`) is generated. A hash of this key (`clave_B`) is created, which can be shared securely.
2. **Encryption and Storage**: `clave_A` is encrypted and stored in both a database and a session object on the server. `clave_B` is sent to the client for storage, for example, in a cookie.
3. **Verification**: To verify a session, `clave_B` is passed from the client. The server decrypts `clave_A` and checks if the hash of `clave_A` matches `clave_B`.

This strategy ensures that even if an attacker accesses the database, they cannot derive `clave_A` from `clave_B` due to the irreversible nature of the hash.

## Installation

Install the package via NPM:

```bash
npm install lek-sessions
```

## Initial Setup

Import and set up the module in your project:

```javascript
require('dotenv').config();
const useLekSessions = require('lek-sessions');
const MANAGER_SECRET = process.env.MANAGER_SECRET; // Key for encrypting/decrypting sessions
const { init, create, confirm } = useLekSessions(MANAGER_SECRET);
```

`MANAGER_SECRET` should be a robust key that will be used for encrypting sessions before storing them.

## System Usage

### Initialization

Initialize the system to load existing sessions and configure the database:

```javascript
await init(); // Call this function when starting your application
```

### Creating Sessions

Create a new session for a user:

```javascript
const keyToCookie = await create('user_id'); // 'user_id' should be a unique identifier for each user

// Optional: Set session expiration and persistence
const sessionWithExpiry = await create('user_id', 3600); // Expires in one hour
const nonPersistentSession = await create('user_id', undefined, false); // Does not persist after server restart
```
///CAMBIOOOOOO
### Confirming Sessions

Verify whether a session is legitimate using the key stored in the client's cookie.

if the session is legitimate the function will return the user_id specified in the previous function

if the session is illegitimate or non-existent the function will return false:

```javascript
const confirmation = await confirm(stringInCookie); // 'stringInCookie' is the value stored in the client's cookie

if (confirmation) {
    console.log('Legitimate session, user_id: ' + confirmation);
} else {
    console.log('Illegitimate session');
}
```

## Security Considerations

- Ensure to keep `MANAGER_SECRET` secure and out of the source code.
- Regularly perform security testing to identify and mitigate potential vulnerabilities.
```