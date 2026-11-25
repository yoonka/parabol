import type Atmosphere from '../Atmosphere'
import {AUTH_DIALOG_WIDTH} from '../components/AuthenticationDialog'
import type {MenuMutationProps} from '../hooks/useMutationProps'
import LoginWithOIDCMutation from '../mutations/LoginWithOIDCMutation'
import ReAuthWithOIDCMutation from '../mutations/ReAuthWithOIDCMutation'
import {LocalStorageKey} from '../types/constEnums'
import type {NavigateFn} from '../types/relayMutations'
import getAnonymousId from './getAnonymousId'
import getOAuthPopupFeatures from './getOAuthPopupFeatures'
import makeHref from './makeHref'

type ReAuthMutationProps = Pick<
  MenuMutationProps,
  'onError' | 'onCompleted' | 'submitMutation' | 'submitting'
>

/** Popup-based Authorization Code flow against the generic OIDC provider (e.g. Zitadel) */
class OIDCClientManager {
  private static startOAuthFlow(
    mutationProps: ReAuthMutationProps,
    getOffsetTop: (() => number) | undefined,
    onCode: (code: string, pseudoId: string | undefined, popup: Window | null) => void,
    loginHint?: string
  ) {
    const {submitting, onError, submitMutation} = mutationProps
    const providerState = crypto.randomUUID()
    const params = new URLSearchParams({
      client_id: window.__ACTION__.oidcClientId,
      scope: window.__ACTION__.oidcScope,
      redirect_uri: makeHref('/auth/oidc'),
      response_type: 'code',
      state: providerState,
      prompt: 'select_account',
      ...(loginHint ? {login_hint: loginHint} : {})
    })
    const uri = `${window.__ACTION__.oidcAuthorizationEndpoint}?${params.toString()}`
    submitMutation()
    const top = getOffsetTop?.() || 56
    const popup = window.open(
      uri,
      'OAuth',
      getOAuthPopupFeatures({width: AUTH_DIALOG_WIDTH, height: 640, top})
    )
    const closeCheckerId = window.setInterval(() => {
      if (popup && popup.closed) {
        onError({message: 'Error logging in! Did you close the popup?'})
        window.clearInterval(closeCheckerId)
        window.removeEventListener('message', handler)
      }
    }, 100)
    const handler = async (event: MessageEvent) => {
      if (typeof event.data !== 'object' || event.origin !== window.location.origin || submitting)
        return
      const {code, state} = event.data
      if (state !== providerState || typeof code !== 'string') return
      window.clearInterval(closeCheckerId)
      window.removeEventListener('message', handler)
      const pseudoId = await getAnonymousId()
      onCode(code, pseudoId, popup)
    }
    window.addEventListener('message', handler)
  }

  static openOAuth(
    atmosphere: Atmosphere,
    mutationProps: MenuMutationProps,
    navigate: NavigateFn,
    pageParams: string,
    invitationToken?: string,
    loginHint?: string,
    getOffsetTop?: () => number
  ) {
    const {onError, onCompleted} = mutationProps
    OIDCClientManager.startOAuthFlow(
      mutationProps,
      getOffsetTop,
      (code, pseudoId, popup) => {
        window.localStorage.removeItem(LocalStorageKey.INVITATION_TOKEN)
        const handleComplete: typeof onCompleted = (...args) => {
          popup && popup.close()
          onCompleted(...args)
        }
        LoginWithOIDCMutation(
          atmosphere,
          {
            code,
            pseudoId,
            invitationToken: invitationToken || '',
            isInvitation: !!invitationToken,
            params: pageParams
          },
          {onError, onCompleted: handleComplete, navigate}
        )
      },
      loginHint
    )
  }

  static openReAuth(
    atmosphere: Atmosphere,
    mutationProps: ReAuthMutationProps,
    onReAuthSuccess: () => void,
    getOffsetTop?: () => number
  ) {
    const {onError, onCompleted} = mutationProps
    OIDCClientManager.startOAuthFlow(mutationProps, getOffsetTop, (code, pseudoId, popup) => {
      ReAuthWithOIDCMutation(atmosphere, {code, pseudoId, params: ''}, (error) => {
        popup && popup.close()
        if (error) {
          onError({message: error})
          onCompleted()
        } else {
          onCompleted()
          onReAuthSuccess()
        }
      })
    })
  }
}

export default OIDCClientManager
