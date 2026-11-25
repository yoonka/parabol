import {AuthIdentityTypeEnum} from '../../../client/types/constEnums'
import AuthIdentity from './AuthIdentity'

interface Input {
  isEmailVerified?: boolean
  // the `sub` claim from the OIDC provider
  id: string
  // the issuer URL, so identities stay unambiguous if the provider ever changes
  issuer: string
}

export default class AuthIdentityOIDC extends AuthIdentity {
  type = 'OIDC' as const
  issuer: string
  constructor(input: Input) {
    super({...input, type: AuthIdentityTypeEnum.OIDC})
    this.issuer = input.issuer
  }
}
