import {AuthIdentityTypeEnum} from '../../../../client/types/constEnums'
import AuthIdentityOIDC from '../../../database/types/AuthIdentityOIDC'
import AuthToken from '../../../database/types/AuthToken'
import User from '../../../database/types/User'
import generateUID from '../../../generateUID'
import {logins} from '../../../metricsHandler'
import {USER_PREFERRED_NAME_LIMIT} from '../../../postgres/constants'
import {getUserByEmail} from '../../../postgres/queries/getUsersByEmails'
import updateUser from '../../../postgres/queries/updateUser'
import {setAuthCookie} from '../../../utils/authCookie'
import getSAMLURLFromEmail from '../../../utils/getSAMLURLFromEmail'
import {fetchOIDCIdentity} from '../../../utils/OIDCServerManager'
import bootstrapNewUser from '../../mutations/helpers/bootstrapNewUser'
import {generateIdenticon} from '../../private/mutations/helpers/generateIdenticon'
import type {MutationResolvers} from '../resolverTypes'
import userErrorResult from './helpers/userErrorResult'

const providerName = () => process.env.OIDC_PROVIDER_NAME || 'SSO'

const loginWithOIDC: MutationResolvers['loginWithOIDC'] = async (
  _source,
  {code, invitationToken, pseudoId},
  context
) => {
  const {dataLoader} = context
  const result = await fetchOIDCIdentity(code)
  if ('error' in result) {
    return userErrorResult('TOKEN_INVALID', `Could not sign in with ${providerName()}`)
  }
  const {issuer, sub, email, emailVerified, name} = result.identity
  if (email.length > USER_PREFERRED_NAME_LIMIT) {
    return userErrorResult('EMAIL_INVALID', 'Email is too long')
  }
  // We match accounts by email, so an unverified email could be used to take over an account
  if (!emailVerified) {
    return userErrorResult(
      'EMAIL_VERIFICATION_REQUIRED',
      `Please verify your email address with ${providerName()} first`
    )
  }

  const [existingUser, samlURL] = await Promise.all([
    getUserByEmail(email),
    getSAMLURLFromEmail(email, dataLoader, false)
  ])

  if (samlURL) {
    return userErrorResult('SIGN_IN_WITH_SSO', 'Your organization requires you to login with SSO.')
  }
  if (existingUser) {
    const {id: viewerId, identities, rol} = existingUser
    const oidcIdentity = identities.find(
      (identity) => identity.type === AuthIdentityTypeEnum.OIDC && identity.id === sub
    )
    if (!oidcIdentity) {
      const [bestIdentity] = identities
      if (bestIdentity && !bestIdentity.isEmailVerified) {
        // the existing account could belong to a squatter. If it's theirs, they need to verify the email
        if (bestIdentity.type === AuthIdentityTypeEnum.LOCAL) {
          return userErrorResult('SIGN_IN_WITH_PASSWORD', 'Try logging in with email and password')
        }
        return userErrorResult('INVALID_CREDENTIALS', 'Unable to link this account')
      }
      const newIdentity = new AuthIdentityOIDC({isEmailVerified: true, id: sub, issuer})
      identities.push(newIdentity) // mutative
      await updateUser({identities: identities.map((id) => JSON.stringify(id))}, viewerId)
    }
    // MUTATIVE
    const tms = await dataLoader.get('teamIdsByUserId').load(viewerId)
    context.authToken = new AuthToken({sub: viewerId, rol, tms})
    setAuthCookie(context, context.authToken)
    logins.inc({method: 'oidc'})
    return {
      userId: viewerId,
      role: context.authToken.rol,
      isNewUser: false
    }
  }

  // it's a new user!
  const userId = `oidc|${generateUID()}`
  const nickname = name || email.substring(0, email.indexOf('@'))
  const preferredName = nickname.length === 1 ? nickname.repeat(2) : nickname
  const identity = new AuthIdentityOIDC({id: sub, isEmailVerified: true, issuer})
  const newUser = new User({
    id: userId,
    preferredName,
    picture: await generateIdenticon(userId, preferredName),
    email,
    identities: [identity],
    pseudoId
  })
  context.authToken = await bootstrapNewUser(newUser, !invitationToken, dataLoader)
  setAuthCookie(context, context.authToken)
  logins.inc({method: 'oidc'})
  return {
    userId,
    role: context.authToken.rol,
    isNewUser: true
  }
}

export default loginWithOIDC
