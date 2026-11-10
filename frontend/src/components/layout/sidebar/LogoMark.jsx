import AkayWordmark from "../../common/AkayWordmark";

export default function LogoMark({ size = "md" }) {
  const boxSize = size === "sm" ? "h-8 w-8" : "h-9 w-9";

  return (
    <div className={`flex ${boxSize} shrink-0 items-center justify-center`}>
      <AkayWordmark compact className="text-[28px]" />
    </div>
  );
}

export function LogoWordmark({ className = "text-[28px]" }) {
  return (
    <AkayWordmark className={className} />
  );
}
