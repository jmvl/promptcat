// Crypto validation tests using Node.js WebCrypto
// This mirrors the browser CryptoService to validate encryption implementation

const crypto = require('crypto').webcrypto;

// CryptoService implementation for Node (exactly as in promptcat.html)
const CryptoService = {
  encoder: new TextEncoder(),
  decoder: new TextDecoder(),

  _base64ToArrayBuffer(base64) {
    const bytes = Buffer.from(base64, 'base64');
    return new Uint8Array(bytes);
  },

  _arrayBufferToBase64(buffer) {
    return Buffer.from(buffer).toString('base64');
  },

  async _deriveKey(password, salt) {
    const keyMaterial = await crypto.subtle.importKey(
      "raw", this.encoder.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { "name": "PBKDF2", salt: salt, "iterations": 100000, "hash": "SHA-256" },
      keyMaterial,
      { "name": "AES-GCM", "length": 256 },
      true,
      ["encrypt", "decrypt"]
    );
  },

  async encrypt(text, password) {
    if (!text || !password) return text;
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await this._deriveKey(password, salt);

      const encryptedContent = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        this.encoder.encode(text)
      );

      return {
        ct: this._arrayBufferToBase64(encryptedContent),
        iv: this._arrayBufferToBase64(iv),
        salt: this._arrayBufferToBase64(salt)
      };
    } catch (e) {
      console.error("Encryption failed", e);
      return text;
    }
  },

  async decrypt(encryptedData, password) {
    if (typeof encryptedData !== 'object' || !encryptedData.ct || !password) return encryptedData;
    try {
      const salt = this._base64ToArrayBuffer(encryptedData.salt);
      const iv = this._base64ToArrayBuffer(encryptedData.iv);
      const key = await this._deriveKey(password, salt);

      const decryptedContent = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        this._base64ToArrayBuffer(encryptedData.ct)
      );

      return this.decoder.decode(decryptedContent);
    } catch (e) {
      console.error("Decryption failed", e);
      return null;
    }
  }
};

// Test framework
let passed = 0, failed = 0;
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Define tests
test('Encryption produces different ciphertexts for same text (random salt/IV)', async () => {
  const text = 'Sensitive content';
  const password = 'test123';
  const encrypted1 = await CryptoService.encrypt(text, password);
  const encrypted2 = await CryptoService.encrypt(text, password);
  assert(encrypted1.ct !== encrypted2.ct, 'Ciphertexts should differ');
  assert(encrypted1.salt !== encrypted2.salt, 'Salts should differ');
  assert(encrypted1.iv !== encrypted2.iv, 'IVs should differ');
});

test('Can encrypt and decrypt successfully (round-trip)', async () => {
  const text = 'Secret message';
  const password = 'securePass!';
  const encrypted = await CryptoService.encrypt(text, password);
  assert(encrypted.ct && encrypted.iv && encrypted.salt, 'Encrypted object should have ct, iv, salt');
  const decrypted = await CryptoService.decrypt(encrypted, password);
  assert(decrypted === text, 'Decrypted text should match original');
});

test('Decryption fails with wrong password (returns null)', async () => {
  const text = 'Secret';
  const password = 'correct';
  const wrongPassword = 'wrong';
  const encrypted = await CryptoService.encrypt(text, password);
  const decrypted = await CryptoService.decrypt(encrypted, wrongPassword);
  assert(decrypted === null, 'Decryption should return null with wrong password');
});

test('Encryption handles empty string', async () => {
  const text = '';
  const password = 'pass';
  const encrypted = await CryptoService.encrypt(text, password);
  const decrypted = await CryptoService.decrypt(encrypted, password);
  assert(decrypted === '', 'Should correctly encrypt/decrypt empty string');
});

test('Encryption returns original text if no password provided', async () => {
  const result = await CryptoService.encrypt('text', null);
  assert(result === 'text', 'Should return original text when password is null');
});

test('Encryption returns null if no text provided', async () => {
  const result = await CryptoService.encrypt(null, 'pass');
  assert(result === null, 'Should return null when text is null');
});

test('PBKDF2 uses 100,000 iterations', async () => {
  let capturedIterations = null;
  // Spy on deriveKey
  const originalDeriveKey = crypto.subtle.deriveKey.bind(crypto.subtle);
  crypto.subtle.deriveKey = async function(...args) {
    const [{ iterations }] = args;
    capturedIterations = iterations;
    return originalDeriveKey.apply(this, args);
  };

  await CryptoService.encrypt('test', 'password');

  assert(capturedIterations === 100000, `Expected 100000 iterations, got ${capturedIterations}`);

  // Restore
  crypto.subtle.deriveKey = originalDeriveKey;
});

test('Encrypted object structure matches specification (ct, iv, salt all base64 strings)', async () => {
  const text = 'data';
  const password = 'pwd';
  const encrypted = await CryptoService.encrypt(text, password);
  assert(typeof encrypted.ct === 'string', 'ct should be string');
  assert(typeof encrypted.iv === 'string', 'iv should be string');
  assert(typeof encrypted.salt === 'string', 'salt should be string');
  // Verify they are valid base64 by decoding
  assert(Buffer.from(encrypted.ct, 'base64').toString('base64') === encrypted.ct, 'ct should be valid base64');
  assert(Buffer.from(encrypted.iv, 'base64').toString('base64') === encrypted.iv, 'iv should be valid base64');
  assert(Buffer.from(encrypted.salt, 'base64').toString('base64') === encrypted.salt, 'salt should be valid base64');
});

test('Different passwords produce different ciphertexts', async () => {
  const text = 'same text';
  const encrypted1 = await CryptoService.encrypt(text, 'password1');
  const encrypted2 = await CryptoService.encrypt(text, 'password2');
  assert(encrypted1.ct !== encrypted2.ct, 'Different passwords should produce different ciphertexts');
});

// Run all tests
(async () => {
  console.log('\n=== Crypto Validation Tests (Node.js WebCrypto) ===\n');

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`\x1b[32m✓\x1b[0m ${name}`);
      passed++;
    } catch (err) {
      console.log(`\x1b[31m✗\x1b[0m ${name}`);
      console.log(`  \x1b[31mError: ${err.message}\x1b[0m`);
      failed++;
    }
  }

  console.log(`\n=== Total: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
