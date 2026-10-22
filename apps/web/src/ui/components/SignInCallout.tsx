import { useId } from 'react'
import { GoogleSignInButton } from './GoogleSignInButton'
import './SignInCallout.css'

export interface SignInCalloutProps {
  onSignIn: () => void
}

/** A slim prompt for signed-out visitors on the landing and results pages. */
export function SignInCallout({ onSignIn }: SignInCalloutProps) {
  const headingId = useId()
  return (
    <section className="sign-in-callout" aria-labelledby={headingId}>
      <div className="sign-in-callout__text">
        <h2 id={headingId}>Save your activities and see them on any device</h2>
        <p className="sign-in-callout__body">
          Sign in with Google to keep your library. Analysis still runs in your browser; activity
          summaries are saved to your private account, original files too if you choose, and you can
          delete everything at any time.
        </p>
      </div>
      <GoogleSignInButton onClick={onSignIn} />
    </section>
  )
}
