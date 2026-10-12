import ConnectionErrorState from "./ConnectionErrorState";
import PageLoadingFallback from "./PageLoadingFallback";
import { errorStateVariant } from "../../utils/errorStateVariant";

export default function PageStateWrapper({
  isLoading,
  isError,
  isFetching,
  hasData,
  error,
  onRetry,
  loadingMessage = "Loading...",
  skeleton,
  bodyOnly = false,
  errorTitle,
  errorMessage,
  children,
}) {
  if (isLoading && !hasData) {
    return <PageLoadingFallback message={loadingMessage} skeleton={skeleton} bodyOnly={bodyOnly} />;
  }

  if (isError && !hasData) {
    return (
      <ConnectionErrorState
        fullPage
        title={errorTitle}
        message={errorMessage}
        onRetry={onRetry}
        retrying={isFetching}
        variant={errorStateVariant(error)}
      />
    );
  }

  return children;
}
