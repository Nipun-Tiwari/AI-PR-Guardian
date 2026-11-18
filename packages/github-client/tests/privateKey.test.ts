import { describe, it, expect } from 'vitest';
import { decodePrivateKey } from '../src/privateKey.js';

const PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF6PZGFw=
-----END RSA PRIVATE KEY-----`;

describe('decodePrivateKey', () => {
  it('accepts raw PEM', () => {
    expect(decodePrivateKey(PEM)).toContain('BEGIN RSA PRIVATE KEY');
  });

  it('accepts base64-encoded PEM', () => {
    const encoded = Buffer.from(PEM, 'utf8').toString('base64');
    expect(decodePrivateKey(encoded)).toContain('BEGIN RSA PRIVATE KEY');
  });

  it('rejects invalid input', () => {
    expect(() => decodePrivateKey('not-a-key')).toThrow(/PEM private key/);
  });
});
