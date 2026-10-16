/**
 * Optional password gate (Vercel Routing Middleware). Set APP_PASSWORD in the Vercel project's
 * environment variables to require it for the app and its API; leave it unset and the app is
 * open. Any username works — only the password is checked.
 */
export const config = { matcher: '/:path*', runtime: 'nodejs' };

export default function middleware(request: Request): Response | undefined {
  const password = process.env.APP_PASSWORD;
  if (!password) return undefined;

  const header = request.headers.get('authorization') ?? '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = atob(encoded);
    if (decoded.slice(decoded.indexOf(':') + 1) === password) return undefined;
  }
  return new Response('Password required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Hark UTM Builder", charset="UTF-8"' },
  });
}
