interface TokenResponse { access_token?: string; error?: string; scope?: string }
interface GoogleOAuth {
  initTokenClient(config: {
    client_id: string
    scope: string
    callback: (response: TokenResponse) => void
    error_callback: () => void
  }): { requestAccessToken(): void }
}

function oauth() {
  return (window as Window & { google?: { accounts?: { oauth2?: GoogleOAuth } } }).google?.accounts?.oauth2
}

let loading: Promise<GoogleOAuth> | undefined

export function loadGoogleOAuth() {
  const ready = oauth()
  if (ready) return Promise.resolve(ready)
  loading ??= new Promise<GoogleOAuth>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => {
      const client = oauth()
      if (client) resolve(client)
      else reject(new Error('Google authorization could not load.'))
    }
    script.onerror = () => reject(new Error('Google authorization could not load.'))
    document.head.append(script)
  }).catch(error => {
    loading = undefined
    throw error
  })
  return loading
}
