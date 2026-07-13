import ConnectionErrorState from "./ConnectionErrorState";
import PageLoadingFallback from "./PageLoadingFallback";
import { isConnectionError } from "../../services/apiClient";

export default function PageStateWrapper({
  isLoading,
  isError,
  isFetching,
  hasData,
  error,
  onRetry,
  loadingMessage = "Loading...",
  errorTitle,
  errorMessage,
  children,
}) {
  if (isLoading && !hasData) {
    return <PageLoadingFallback message={loadingMessage} />;
  }

  if (isError && !hasData) {
    return (
      <ConnectionErrorState
        fullPage
        title={
          errorTitle ||
          (isConnectionError(error) ? "Connection Lost" : "Unable to Load Data")
        }
        message={errorMessage}
        onRetry={onRetry}
        retrying={isFetching}
        variant={
          error?.isTimeout
            ? "timeout"
            : isConnectionError(error)
              ? "offline"
              : "error"
        }
      />
    );
  }

  return children;
}
