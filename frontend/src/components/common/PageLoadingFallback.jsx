import AkayLogoLoader from "./loading/AkayLogoLoader";

export default function PageLoadingFallback({
  message = "Loading...",
  minHeight = "min-h-[calc(100dvh-9rem)]",
}) {
  return (
    <div
      className={`flex ${minHeight} items-center justify-center rounded-xl bg-white px-4 py-12`}
    >
      <AkayLogoLoader label={message} size="lg" variant="fetch" card />
    </div>
  );
}
