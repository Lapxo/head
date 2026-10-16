import type { Fields } from '../../access/contract.ts';

const text = (json: unknown, key: string): string | undefined => ((v) => (typeof v === 'string' && v ? v : undefined))((json as Record<string, unknown> | undefined)?.[key]);
const texts = (json: unknown, key: string): readonly string[] => ((v) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []))((json as Record<string, unknown> | undefined)?.[key]);
const fields = (pairs: Readonly<Record<string, string | readonly string[]>>): Fields => Object.fromEntries(Object.entries(pairs).map(([k, v]) => [k, [v].flat()]));

/**
 * The authorizer a resource names when it refuses a request: its protected resource metadata (RFC 9728) at the address
 * its challenge gives, which must name the very origin that refused; the authorization server's metadata (RFC 8414),
 * which must name the issuer the resource named and take S256; and from them the oauth2 authorization-code flow a
 * document would have declared — the same steps, PKCE through head's page, a client registered (RFC 7591) only where
 * the server offers registration and the person's own where it does not, the token and its refresh, renewed at the
 * token endpoint. Every one of these reads goes with nothing attached; what does not hold is no authorizer.
 */
export const discovered = async (resource: string, challenge: string, get: (url: string) => Promise<unknown>): Promise<Readonly<Record<string, Fields>> | undefined> => {
  const at = /resource_metadata="([^"]+)"/.exec(challenge)?.[1];
  if (at === undefined || !URL.canParse(at, resource)) return undefined;
  const named = await get(new URL(at, resource).href), [issuer] = texts(named, 'authorization_servers'), own = text(named, 'resource');
  if (own === undefined || !URL.canParse(own) || new URL(own).origin !== new URL(resource).origin || issuer === undefined || !URL.canParse(issuer)) return undefined;
  const server = await get(`${new URL(issuer).origin}/.well-known/oauth-authorization-server${new URL(issuer).pathname.replace(/\/$/, '')}`);
  const [authorize, token, register, methods] = [text(server, 'authorization_endpoint'), text(server, 'token_endpoint'), text(server, 'registration_endpoint'), texts(server, 'code_challenge_methods_supported')];
  if (text(server, 'issuer') !== issuer || authorize === undefined || token === undefined || (methods.length > 0 && !methods.includes('S256'))) return undefined;
  const [client, scopes] = [register ? '$steps.register.outputs.client' : '$client', texts(named, 'scopes_supported').join(' ')];
  const sent = (step: string, pairs: Readonly<Record<string, string>>) => Object.fromEntries(Object.entries(pairs).filter(([, v]) => v).map(([k, v]) => [`${step}/payload/${k}`, fields({ value: v })]));
  return {
    '': fields({ type: 'oauth2/authorizationCode', issuer, 'attach-in': 'header', 'attach-name': 'Authorization', 'attach-template': 'Bearer {token}', token: '$steps.exchange.outputs.token', expires: '$steps.exchange.outputs.expires', refresh: '$steps.exchange.outputs.refresh', renew: token }),
    ...(register ? { 'steps/0': fields({ id: 'register', url: register, encoding: 'json' }), 'steps/0/payload/redirect_uris': fields({ items: '$callback' }), 'steps/0/payload/grant_types': fields({ items: ['authorization_code', 'refresh_token'] }),
      'steps/0/payload/response_types': fields({ items: 'code' }), ...sent('steps/0', { client_name: 'head', token_endpoint_auth_method: "'none'" }), 'steps/0/outputs/client': fields({ value: '$response.body#/client_id' }) } : {}),
    'steps/1': fields({ id: 'authorize', page: authorize }), 'steps/1/outputs/code': fields({ value: '$response.body#/code' }),
    ...sent('steps/1', { client_id: client, redirect_uri: '$callback', response_type: 'code', scope: scopes, state: '$state', code_challenge: 's256($verifier)', code_challenge_method: 'S256', resource: new URL(resource).origin }),
    'steps/2': fields({ id: 'exchange', url: token, encoding: 'form' }), ...sent('steps/2', { grant_type: 'authorization_code', code: '$steps.authorize.outputs.code', redirect_uri: '$callback', client_id: client, code_verifier: '$verifier', resource: new URL(resource).origin }),
    'steps/2/outputs/token': fields({ value: '$response.body#/access_token' }), 'steps/2/outputs/expires': fields({ value: '$response.body#/expires_in' }), 'steps/2/outputs/refresh': fields({ value: '$response.body#/refresh_token' }),
  };
};
