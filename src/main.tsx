import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";
import { initSentry } from "./lib/sentry";

initSentry();

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary
    fallback={
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <h1 className="font-serif text-2xl mb-3">Something went wrong</h1>
        <p className="text-sm text-muted-foreground mb-6">
          We've been notified. Please refresh the page or call (636) 600-1333 to place your order.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2.5 bg-accent text-accent-foreground text-sm font-sans font-semibold uppercase tracking-wider rounded-sm"
        >
          Refresh
        </button>
      </div>
    }
  >
    <App />
  </Sentry.ErrorBoundary>,
);
