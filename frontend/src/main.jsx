import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router";
import App from "./App";
// Self-hosted font (no CDN — poor-connectivity context). The variable
// family covers Inter's full 100–900 weight axis.
import "@fontsource-variable/inter";
import "./index.css";
import { Toaster } from "react-hot-toast";
import { NotificationProvider } from "./hooks/useNotificationsContext";
import { queryClient } from "./lib/queryClient";
import { clearLegacySensitiveBrowserData } from "./utils/sessionPrivacy";

void clearLegacySensitiveBrowserData();

// A data router only so pages can use useBlocker (the consultation workspace saves its
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
