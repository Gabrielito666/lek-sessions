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

The exported methods are as follows:

- getUniqueKey
- getUniqueKeySync
- cipher
- cipherSync
- decipher
- decipherSync
- encrypt
- encryptSync
- compare
- compareSync
- cipherStream
- decipherStream

Many have a sync version. The truth is that the processes are usually very fast and it is not necessary to use the asynchronous view... however it can be useful for encrypting or decrypting large chunks of data in parallel or similar situations. I recommend using the Sync version for most cases.

Versions before 2.0.0 had almost only synchronous versions (except encrypt) so to migrate to later versions you should simply add sync to the method used.

cipher => cipherSync

#### getUniqueKey(num = 64)

Generates a unique key or ID.

```javascript
const uniqueKey = await lekCryptoTools.getUniqueKey();
console.log(uniqueKey); // Outputs a 128-character hexadecimal string
```
or

```javascript
const uniqueKey = lekCryptoTools.getUniqueKeySync();
console.log(uniqueKey); // Outputs a 128-character hexadecimal string
```
#### encrypt(data, num = 10)

Hashes a string using bcrypt.

```javascript
const hashedPassword = await lekCryptoTools.encrypt('myPassword');
console.log(hashedPassword);
```
or
```javascript
const hashedPassword = lekCryptoTools.encryptSync('myPassword');
console.log(hashedPassword);
```

#### compare(data, encrypted)

Compares a plain text string with a hashed string.

```javascript
const isMatch = await lekCryptoTools.compare('myPassword', hashedPassword);
console.log(isMatch); // Outputs: true or false
```
or
```javascript
const isMatch = lekCryptoTools.compareSync('myPassword', hashedPassword);
console.log(isMatch); // Outputs: true or false
```

#### cipher(data, secretKey)

Encrypts a string or buffer.

```javascript
const encryptedData = await lekCryptoTools.cipher('sensitive data', 'mySecretKey');
console.log(encryptedData);
```
or

```javascript
const encryptedData = lekCryptoTools.cipherSync('sensitive data', 'mySecretKey');
console.log(encryptedData);
```

#### decipher(encrypted, secretKey)

Decrypts previously encrypted data.

```javascript
const decryptedData = await lekCryptoTools.decipher(encryptedData, 'mySecretKey');
console.log(decryptedData); // Outputs: 'sensitive data'
```
or
```javascript
const decryptedData = lekCryptoTools.decipherSync(encryptedData, 'mySecretKey');
console.log(decryptedData); // Outputs: 'sensitive data'
```
In both methods above. If you give a string as the first parameter, a string will be returned. Otherwise, if you enter a buffer, a buffer will be returned.

# 3.0.0

This new version includes two new features.

### cipherStream

This function receives three parameters, stream input and output and the secret key.

will pass through the stream encrypting the data bit by bit.
You can wait for the promise or capture the event finish of the stream output.
If you wait for the promise, note that it does not return anything since the essence of the stream is not to fill the memory.

```javascript
const inputFile = fs.createReadStream('a-file.abc');
const outputFile = fs.createWriteStream('ciphred-file.enc');

lekCryptoTools.cipherStream(inputFile, outputFile, "secret-key");
```

### decipherStream

This function receives an input and output stream in the same way and decrypts it bit by bit.

You can either encrypt with cipher and decrypt with decipherStream or encrypt with cipherStream and decrypt with decipherStream without problems.

```javascript
const inputFile = fs.createReadStream('ciphred-file.enc');
const outputFile = fs.createWriteStream('a-file.abc');

inputFile.on('open', () =>
{
    lekCryptoTools.decipherStream(inputDecFile, outputDecFile, key);
});
```

### LekCryptoolsError

Finally... LekCryptoolsError is a class. It is useful if you catch an error and want to know if it comes from here. Especially DECIPHER which is an error that usually has to do with the user setting the wrong decryption key.

```javascript

try
{
    const result = await lekCryptoTools.decipher('the-cipher-data', 'incorrect-key');
}
catch(err)
{
    if(err instanceof lekCryptoTools.LekCryptoolsError)
    {
        console.error('the key is incorrect');
    }
}
```

## Security Note

This package uses standard cryptographic libraries, but remember that the security of your application depends on how you manage your secret keys and sensitive data. Always follow best practices for key management and never expose your secret keys.

## License

[ISC]

## Contributing

Contributions, issues, and feature requests are welcome. Feel free to check [issues page](https://github.com/Gabrielito666/lek-cryptools/issues) if you want to contribute.

## Author

Your Name - [Gabriel Farías](https://github.com/Gabrielito666)

## Acknowledgments

- [bcryptjs](https://www.npmjs.com/package/bcryptjs)
- [crypto](https://nodejs.org/api/crypto.html)