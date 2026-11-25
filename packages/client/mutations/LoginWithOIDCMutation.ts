import graphql from 'babel-plugin-relay/macro'
import {commitMutation} from 'react-relay'
import {handleSuccessfulLogin} from '~/utils/handleSuccessfulLogin'
import type {LoginWithOIDCMutation as TLoginWithOIDCMutation} from '../__generated__/LoginWithOIDCMutation.graphql'
import type {NavigateLocalHandler, StandardMutation} from '../types/relayMutations'
import {handleAcceptTeamInvitationErrors} from './AcceptTeamInvitationMutation'
import handleAuthenticationRedirect from './handlers/handleAuthenticationRedirect'

const mutation = graphql`
  mutation LoginWithOIDCMutation(
    $code: ID!
    $invitationToken: ID!
    $pseudoId: ID
    $isInvitation: Boolean!
    $params: String!
  ) {
    loginWithOIDC(
      code: $code
      pseudoId: $pseudoId
      invitationToken: $invitationToken
      params: $params
    ) {
      userErrors {
        message
      }
      ...handleSuccessfulLogin_UserLogInPayload @relay(mask: false)
    }
    # Validation occurs statically https://github.com/graphql/graphql-js/issues/1334
    # A default value is necessary even in the case of @include(if: false)
    acceptTeamInvitation(invitationToken: $invitationToken) @include(if: $isInvitation) {
      ...AcceptTeamInvitationMutationReply @relay(mask: false)
    }
  }
`
const LoginWithOIDCMutation: StandardMutation<TLoginWithOIDCMutation, NavigateLocalHandler> = (
  atmosphere,
  variables,
  {onError, onCompleted, navigate}
) => {
  return commitMutation<TLoginWithOIDCMutation>(atmosphere, {
    mutation,
    variables: {...variables, isInvitation: !!variables.invitationToken},
    onError,
    onCompleted: (res, errors) => {
      const {acceptTeamInvitation, loginWithOIDC} = res
      onCompleted({loginWithOIDC}, errors)
      const [userError] = loginWithOIDC.userErrors
      handleAcceptTeamInvitationErrors(atmosphere, acceptTeamInvitation)
      if (!userError && !errors) {
        handleSuccessfulLogin(atmosphere, loginWithOIDC)
        handleAuthenticationRedirect(acceptTeamInvitation, {
          atmosphere,
          navigate
        })
      }
    }
  })
}

export default LoginWithOIDCMutation
