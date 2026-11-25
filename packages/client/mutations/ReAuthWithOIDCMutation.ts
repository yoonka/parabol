import graphql from 'babel-plugin-relay/macro'
import {commitMutation} from 'react-relay'
import type {ReAuthWithOIDCMutation as TReAuthWithOIDCMutation} from '../__generated__/ReAuthWithOIDCMutation.graphql'
import type Atmosphere from '../Atmosphere'
import getMutationError from '../utils/relay/getMutationError'

const mutation = graphql`
  mutation ReAuthWithOIDCMutation($code: ID!, $pseudoId: ID, $params: String!) {
    loginWithOIDC(code: $code, pseudoId: $pseudoId, invitationToken: "", params: $params) {
      userErrors {
        message
      }
      userId
    }
  }
`

const ReAuthWithOIDCMutation = (
  atmosphere: Atmosphere,
  variables: {code: string; pseudoId?: string; params: string},
  onCompleted: (error?: string) => void
) => {
  return commitMutation<TReAuthWithOIDCMutation>(atmosphere, {
    mutation,
    variables,
    onError: (err) => onCompleted(getMutationError(err).message),
    onCompleted: (res) => {
      const [userError] = res.loginWithOIDC.userErrors
      onCompleted(userError?.message)
    }
  })
}

export default ReAuthWithOIDCMutation
