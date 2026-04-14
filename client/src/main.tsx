import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;
  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;
  if (!isUnauthorized) return;
  if (window.location.pathname === "/login") return;
  window.location.href = "/login";
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
  }
});

const SESSION_TOKEN_KEY = "app_session_token";
const SESSION_COOKIE_KEY = "app_session_backup";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

function setTokenCookie(token: string) {
  document.cookie = `${SESSION_COOKIE_KEY}=${encodeURIComponent(token)}; max-age=${ONE_YEAR_SECONDS}; path=/; SameSite=Lax`;
}

function getTokenCookie(): string | null {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${SESSION_COOKIE_KEY}=`));
  if (!match) return null;
  return decodeURIComponent(match.split("=").slice(1).join("="));
}

function clearTokenCookie() {
  document.cookie = `${SESSION_COOKIE_KEY}=; max-age=0; path=/`;
}

export function getStoredToken(): string | null {
  const lsToken = localStorage.getItem(SESSION_TOKEN_KEY);
  if (lsToken) return lsToken;
  // Fallback: iOS WebKit clears localStorage for home screen apps after inactivity.
  // Restore from cookie if still present.
  const cookieToken = getTokenCookie();
  if (cookieToken) {
    localStorage.setItem(SESSION_TOKEN_KEY, cookieToken);
    return cookieToken;
  }
  return null;
}

export function setStoredToken(token: string) {
  localStorage.setItem(SESSION_TOKEN_KEY, token);
  setTokenCookie(token);
}

export function clearStoredToken() {
  localStorage.removeItem(SESSION_TOKEN_KEY);
  clearTokenCookie();
}

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        const token = getStoredToken();
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
          headers: { ...(init?.headers as Record<string, string> ?? {}), ...headers },
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
