# lek-cryptools

lek-cryptools is a lightweight cryptographic utility package for Node.js, providing easy-to-use functions for generating unique keys, hashing, and encrypting/decrypting data.

## Installation

You can install lek-cryptools using npm:

```bash
npm install lek-cryptools
```

## Usage

First, require the package in your Node.js application:

```javascript
const lekCryptoTools = require('lek-cryptools');
```

### Available Functions

#### getUniqueKey(num = 64)

Generates a unique key or ID.

```javascript
const uniqueKey = lekCryptoTools.getUniqueKey();
console.log(uniqueKey); // Outputs a 128-character hexadecimal string
```

#### encrypt(data, num = 10)

Hashes a string using bcrypt.

```javascript
const hashedPassword = await lekCryptoTools.encrypt('myPassword');
console.log(hashedPassword);
```

#### cipher(data, secretKey)

Encrypts a string or buffer.

```javascript
const encryptedData = lekCryptoTools.cipher('sensitive data', 'mySecretKey');
console.log(encryptedData);
```

#### decipher(encrypted, secretKey)

Decrypts previously encrypted data.

```javascript
const decryptedData = lekCryptoTools.decipher(encryptedData, 'mySecretKey');
console.log(decryptedData); // Outputs: 'sensitive data'
```

#### compare(data, encrypted)

Compares a plain text string with a hashed string.

```javascript
const isMatch = await lekCryptoTools.compare('myPassword', hashedPassword);
console.log(isMatch); // Outputs: true or false
```

## Security Note

This package uses standard cryptographic libraries, but remember that the security of your application depends on how you manage your secret keys and sensitive data. Always follow best practices for key management and never expose your secret keys.

## License

[ISC]

## Contributing

Contributions, issues, and feature requests are welcome. Feel free to check [issues page](https://github.com/yourusername/lek-cryptools/issues) if you want to contribute.

## Author

Your Name - [Gabriel Farías](https://github.com/Gabrielito666)

## Acknowledgments

- [bcryptjs](https://www.npmjs.com/package/bcryptjs)
- [crypto](https://nodejs.org/api/crypto.html)