# Lek Sessions 2.0.1

Lek Sessions is a personalized and secure session management and storage system. It uses cryptographic techniques to protect session keys and ensures that only authorized developers can access the necessary keys for session verification.

## Basic Operation

1. **Key Generation**: A unique hexadecimal key (`key_A`) is generated. A hash of this key (`key_B`) is created, which can be shared securely.
2. **Encryption and Storage**: `key_A` is encrypted and stored in both a database and a session object on the server. `key_B` is sent to the client for storage, for example, in a cookie.
3. **Verification**: To verify a session, `key_B` is passed from the client. The server decrypts `key_A` and checks if the hash of `key_A` matches `key_B`.

This strategy ensures that even if an attacker accesses the database, they cannot derive `key_A` from `key_B` due to the irreversible nature of the hash.

## Installation

Install the package via NPM:

```bash
npm install lek-sessions
```

## Initial Setup

Import and set up the module in your project:

```javascript
const useLekSessions = require('lek-sessions');

(async()=>{
    const { create, confirm, close } = await useLekSessions('my-secret');
})

```
__1.0.3 ==> 2.0.0__
A major change between this and the previous version is that useLekSessions is now asynchronous and no longer returns an init method. it initialises itself.

__2.0.0 ==> 2.0.1__
Now you can push folder for sqlite database and databasename with parameters of the function.

## System Usage

### Creating Sessions

Create a new session for a user:

```javascript
const keyToCookie = await create('user_id'); // 'user_id' should be a unique identifier for each user

// Optional: Set session expiration and persistence
const sessionWithExpiry = await create('user_id', 3600); // Expires in one hour
const nonPersistentSession = await create('user_id', undefined, false); // Does not persist after server restart
```

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

### Close
close is a method that is called to terminate the use of the system. it is not necessary on web servers, it simply clears the interval at which the encryption key is rotated.

__1.0.3 ==> 2.0.0__
Cookies generated with a previous version are no longer valid. So you cannot update the package if you are already using version 1.0.3. This is due to a new internal handling of lek-cryptools. If I see interest from someone I can create a method to migrate old cookies.