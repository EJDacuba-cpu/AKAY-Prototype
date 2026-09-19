import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router";
import App from "./App";
// Self-hosted fonts (no CDN — poor-connectivity context).
// Variable families cover their full weight axes (Public Sans 400–700,
// Source Serif 4 500/600); IBM Plex Mono is static, so weights are explicit.
import "@fontsource-variable/public-sans";
import "@fontsource-variable/source-serif-4";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./index.css";
import { Toaster } from "react-hot-toast";
import { NotificationProvider } from "./hooks/useNotificationsContext";
import { queryClient } from "./lib/queryClient";
import { clearLegacySensitiveBrowserData } from "./utils/sessionPrivacy";

void clearLegacySensitiveBrowserData();

// A data router only so pages can use useBlocker (Add Health Record saves its
// draft before letting the user navigate away). Every route still lives in
// App's own <Routes>; this single splat route just hosts it.
const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <NotificationProvider>
        <App />
        <Toaster position="top-right" />
      </NotificationProvider>
    ),
  },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
