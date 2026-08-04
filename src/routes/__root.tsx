import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="page-fallback">
      <div className="page-fallback-card">
        <h1 className="page-fallback-title">Page not found</h1>
        <p className="page-fallback-text">That page does not exist. Head back to the app.</p>
        <div className="page-fallback-actions">
          <Link to="/" className="fallback-button">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="page-fallback">
      <div className="page-fallback-card">
        <h1 className="page-fallback-title">This page did not load</h1>
        <p className="page-fallback-text">
          Something went wrong on our end. You can try again or head back home.
        </p>
        <div className="page-fallback-actions">
          <button
            type="button"
            className="fallback-button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Try again
          </button>
          <a href="/" className="fallback-button fallback-button-quiet">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Daily Notes" },
      { name: "description", content: "Quick daily notes, collated each evening." },
      { property: "og:title", content: "Daily Notes" },
      { name: "twitter:title", content: "Daily Notes" },
      { property: "og:description", content: "Quick daily notes, collated each evening." },
      { name: "twitter:description", content: "Quick daily notes, collated each evening." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1483b2d4-9291-4f00-8c11-a5f98e7d4bc9/id-preview-ac71a8c9--fe4df7d3-82fd-4205-bf1f-8372ecc4f439.lovable.app-1785814142901.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1483b2d4-9291-4f00-8c11-a5f98e7d4bc9/id-preview-ac71a8c9--fe4df7d3-82fd-4205-bf1f-8372ecc4f439.lovable.app-1785814142901.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&family=Fraunces:opsz,wght@9..144,600&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
