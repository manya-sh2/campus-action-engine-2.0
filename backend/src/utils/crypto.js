const crypto = require('crypto');
const env = require('../config/env');

const ALGORITHM = 'aes-256-gcm';

// Encrypts/decrypts secrets (Google access/refresh tokens) before they
// touch MongoDB, so a DB dump alone isn't enough to use a user's Google
// account. Key comes from TOKEN_ENCRYPTION_KEY (64 hex chars / 32 bytes).
// Generate one with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

function getKey() {
  const keyHex = env.TOKEN_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is missing or invalid. It must be a 64-character hex string (32 bytes). " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypts a string, returning "iv:authTag:ciphertext" (all hex).
 */
function encrypt(plainText) {
  if (plainText === null || plainText === undefined) return plainText;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

/**
 * Decrypts a string produced by encrypt().
 */
function decrypt(payload) {
  if (payload === null || payload === undefined) return payload;

  const [ivHex, authTagHex, encryptedHex] = payload.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Invalid encrypted payload format');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };
