import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Match the root (redirects to /en) and every locale-prefixed path.
  // Skip API routes, Next internals and files with an extension.
  matcher: ["/", "/(bn|en|ja)/:path*", "/((?!api|_next|_vercel|.*\\..*).*)"],
};
