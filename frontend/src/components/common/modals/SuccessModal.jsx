import { CheckCircle2, X } from "lucide-react";

export default function SuccessModal({
  open,
  title,
  description,
  buttonText = "Continue",
  onClose,
}) {
  if (!open) return null;

  return (
    <div
      className="
        fixed inset-0 z-[9999]
        flex items-center justify-center
        p-4

        anim-overlay

        bg-slate-900/30
        backdrop-blur-[2px]
      "
      onClick={onClose}
    >
      {/* Modal */}
      <div
        className="
          anim-content-in

          relative w-full max-w-sm

          overflow-hidden
          rounded-2xl

          border border-slate-100/80
          bg-white

          shadow-xl shadow-slate-900/10
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="
            absolute right-3 top-3

            flex h-7 w-7
            items-center justify-center

            rounded-md

            text-slate-300

            transition-all duration-150

            hover:bg-slate-50
            hover:text-slate-500
          "
        >
          <X size={15} strokeWidth={2} />
        </button>

        {/* Content */}
        <div className="px-6 pt-6 pb-6">
          {/* Icon */}
          <div
            className="
              mb-4 flex h-11 w-11
              items-center justify-center

              rounded-xl

              border border-emerald-100/50
              bg-emerald-50
            "
          >
            <CheckCircle2
              size={20}
              className="text-emerald-500"
              strokeWidth={1.8}
            />
          </div>

          {/* Title */}
          <h2
            className="
              text-[15px]
              font-semibold
              leading-snug
              text-slate-800
            "
          >
            {title}
          </h2>

          {/* Description */}
          <p
            className="
              mt-1.5 text-[13px]
              leading-relaxed
              text-slate-500
            "
          >
            {description}
          </p>

          {/* Action */}
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="
                press-scale

                flex h-9.5
                items-center justify-center

                rounded-lg

                bg-emerald-600

                px-4

                text-[13px]
                font-medium
                text-white

                transition-all duration-150

                hover:bg-emerald-700
                active:bg-emerald-800
              "
            >
              {buttonText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
