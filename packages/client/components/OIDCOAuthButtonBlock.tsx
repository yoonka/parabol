import {useLocation, useNavigate} from 'react-router'
import useAtmosphere from '../hooks/useAtmosphere'
import useMutationProps from '../hooks/useMutationProps'
import {Button} from '../ui/Button/Button'
import {cn} from '../ui/cn'
import {Key as KeyIcon} from '../ui/icons'
import OIDCClientManager from '../utils/OIDCClientManager'
import StyledError from './StyledError'
import StyledTip from './StyledTip'

interface Props {
  invitationToken?: string
  isCreate?: boolean
  loginHint?: string
  getOffsetTop?: () => number
}

export const OIDCProviderLogo = ({dimmed}: {dimmed?: boolean}) => {
  const logoUrl = window.__ACTION__.oidcLogoUrl
  const className = cn('mx-4 h-[18px] w-[18px]', dimmed && 'saturate-0')
  return logoUrl ? <img src={logoUrl} alt='' className={className} /> : <KeyIcon className={className} />
}

const OIDCOAuthButtonBlock = (props: Props) => {
  const {invitationToken, isCreate, loginHint, getOffsetTop} = props
  const {onError, error, submitting, onCompleted, submitMutation} = useMutationProps({
    errorDisplay: 'inline'
  })
  const atmosphere = useAtmosphere()
  const navigate = useNavigate()
  const location = useLocation()
  const providerName = window.__ACTION__.oidcProviderName
  const label = isCreate ? `Sign up with ${providerName}` : `Sign in with ${providerName}`
  const openOAuth = () => {
    const mutationProps = {onError, onCompleted, submitMutation, submitting}
    OIDCClientManager.openOAuth(
      atmosphere,
      mutationProps,
      navigate,
      location.search,
      invitationToken,
      loginHint,
      getOffsetTop
    )
  }
  return (
    <>
      <Button
        variant='raised'
        size='sm'
        onClick={openOAuth}
        disabled={submitting}
        className={cn(
          'mt-4 h-10 w-60 justify-start bg-slate-200 px-4 text-slate-700 text-sm disabled:opacity-100',
          submitting ? 'bg-slate-300 text-slate-600' : 'bg-white text-slate-700'
        )}
      >
        <OIDCProviderLogo dimmed={submitting} />
        <div>{label}</div>
      </Button>
      {error && !submitting && (
        <StyledError className='mt-2 text-[13px]'>{error.message}</StyledError>
      )}
      {submitting && (
        <StyledTip className='mt-2 text-[13px]'>Continue through the login popup</StyledTip>
      )}
    </>
  )
}

export default OIDCOAuthButtonBlock
