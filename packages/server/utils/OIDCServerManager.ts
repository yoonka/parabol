import {fetch} from '@whatwg-node/fetch'
import {decode} from 'jsonwebtoken'
import makeAppURL from 'parabol-client/utils/makeAppURL'
import appOrigin from '../appOrigin'
import logError from './logError'

/**
 * Generic OpenID Connect provider (e.g. Zitadel), configured via env:
 * OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_TOKEN_AUTH_METHOD
 */

interface DiscoveryDocument {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
}

interface TokenResponse {
  access_token?: string
  id_token?: string
  error?: string
  error_description?: string
}

interface IDToken {
  iss: string
  sub: string
  aud: string | string[]
}

interface UserInfo {
  sub: string
  email?: string
  email_verified?: boolean
  name?: string
  preferred_username?: string
}

export interface OIDCIdentity {
  issuer: string
  sub: string
  email: string
  emailVerified: boolean
  name?: string
}

export const OIDC_REDIRECT_PATH = 'auth/oidc'

export const getOIDCIssuer = () => (process.env.OIDC_ISSUER || '').replace(/\/+$/, '')

export const isOIDCConfigured = () =>
  !!(getOIDCIssuer() && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET)

let discoveryPromise: Promise<DiscoveryDocument> | null = null

const getDiscovery = () => {
  if (!discoveryPromise) {
    const url = `${getOIDCIssuer()}/.well-known/openid-configuration`
    discoveryPromise = fetch(url, {headers: {Accept: 'application/json'}})
      .then(async (res) => {
        if (!res.ok) throw new Error(`OIDC discovery failed (${res.status}) at ${url}`)
        return (await res.json()) as DiscoveryDocument
      })
      .catch((e) => {
        // don't cache failures, try again on the next login
        discoveryPromise = null
        throw e
      })
  }
  return discoveryPromise
}

const fail = (message: string) => {
  logError(new Error(`OIDC: ${message}`))
  return {error: message} as const
}

/**
 * Exchanges an authorization code for the user's identity.
 * The tokens come straight from the token endpoint over TLS with client authentication,
 * so per OIDC Core 3.1.3.7 the ID token signature need not be re-verified,
 * but we still check issuer, audience and that userinfo matches the ID token subject.
 */
export const fetchOIDCIdentity = async (
  code: string
): Promise<{identity: OIDCIdentity} | {error: string}> => {
  if (!isOIDCConfigured()) return fail('Provider is not configured')
  const clientId = process.env.OIDC_CLIENT_ID!
  const clientSecret = process.env.OIDC_CLIENT_SECRET!
  const discovery = await getDiscovery()

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: makeAppURL(appOrigin, OIDC_REDIRECT_PATH)
  })
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded'
  }
  if (process.env.OIDC_TOKEN_AUTH_METHOD === 'client_secret_post') {
    body.set('client_id', clientId)
    body.set('client_secret', clientSecret)
  } else {
    const basic = `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`
    headers.Authorization = `Basic ${Buffer.from(basic).toString('base64')}`
  }

  const tokenRes = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers,
    body: body.toString()
  })
  const tokenJson = (await tokenRes.json()) as TokenResponse
  const {access_token: accessToken, id_token: idTokenStr} = tokenJson
  if (!tokenRes.ok || !accessToken || !idTokenStr) {
    return fail(
      `Token exchange failed: ${tokenJson.error_description || tokenJson.error || tokenRes.status}`
    )
  }

  const idToken = decode(idTokenStr) as IDToken | null
  const audiences = Array.isArray(idToken?.aud) ? idToken.aud : [idToken?.aud]
  if (!idToken || idToken.iss !== discovery.issuer || !audiences.includes(clientId)) {
    return fail('ID token issuer or audience mismatch')
  }

  const userInfoRes = await fetch(discovery.userinfo_endpoint, {
    headers: {Accept: 'application/json', Authorization: `Bearer ${accessToken}`}
  })
  if (!userInfoRes.ok) return fail(`Userinfo request failed (${userInfoRes.status})`)
  const userInfo = (await userInfoRes.json()) as UserInfo
  if (userInfo.sub !== idToken.sub) return fail('Userinfo subject mismatch')
  if (!userInfo.email) return fail('Provider did not return an email address')

  return {
    identity: {
      issuer: discovery.issuer,
      sub: userInfo.sub,
      email: userInfo.email.toLowerCase(),
      emailVerified: userInfo.email_verified === true,
      name: userInfo.name || userInfo.preferred_username
    }
  }
}
