import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import "./index.css";
import "./App.css";
import { I18nProvider } from "./i18n";
import router from "./router";
import { authService } from "./services/auth";

authService.init();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
