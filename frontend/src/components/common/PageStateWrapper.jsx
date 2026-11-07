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
  skeletonOptions,
  errorTitle,
  errorMessage,
  children,
}) {
  const accessDenied = isError && [401, 403].includes(error?.status);
  if (isLoading && !hasData && !accessDenied) {
    return <PageLoadingFallback message={loadingMessage} skeleton={skeleton} bodyOnly={bodyOnly} skeletonOptions={skeletonOptions} />;
  }

  if (isError && (!hasData || accessDenied)) {
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
