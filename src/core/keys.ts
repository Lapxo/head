import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { formatSignature, signerRequestBytes, signerResponseBytes } from '@lapxo/topos/wire';

export interface Key { readonly secret: string; readonly publicKey: string }

/** A new device key: its secret as base64 PKCS8 for the keychain to keep, its public half as base64 SPKI for a lock to admit. */
export const newKey = (): Key => ((pair) => ({
  secret: pair.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
  publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
}))(generateKeyPairSync('ed25519'));

/**
 * One signing lot answered as the signing-lot/1 contract asks: every line the lot carries, already the bytes a signature
 * covers and named by this key alone, signed in order under the algorithm the host was told. A lot naming any other key,
 * or bytes not in their canonical form, is refused whole: topos's own request reader decides, never this file.
 */
export const signLot = (input: string, secret: string, keyId: string, algorithm: string): string => {
  const bytes = input.endsWith('\n') ? input.slice(0, -1).split('\n') : [];
  signerRequestBytes({ bytes, keyId, algorithm });
  const key = createPrivateKey({ key: Buffer.from(secret, 'base64'), format: 'der', type: 'pkcs8' });
  return signerResponseBytes(bytes.map((one) => ({ keyId, signature: formatSignature(algorithm, sign(null, Buffer.from(one, 'utf8'), key).toString('base64')) })));
};

/** The public half of a kept secret, as a lock admits it. */
export const publicOf = (secret: string): string => createPublicKey(createPrivateKey({ key: Buffer.from(secret, 'base64'), format: 'der', type: 'pkcs8' })).export({ type: 'spki', format: 'der' }).toString('base64');
