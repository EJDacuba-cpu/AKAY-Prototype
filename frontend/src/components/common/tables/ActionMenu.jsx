import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { formatDisplayValue } from "../../../utils/formatters";

export default function ActionMenu({
  title,
  subtitle,

  viewLink,
  editLink,
  referralLink,
  /* 1. BAGONG PROPS PARA SA EDIT PATIENT */
  editPatientLink,

  viewLabel = "View Details",
  editLabel = "Edit",
  referralLabel = "Submit Referral",
  /* 2. BAGONG DEFAULT LABEL */
  editPatientLabel = "Edit Patient",
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const displayTitle = formatDisplayValue(title, "Not recorded");
  const displaySubtitle = subtitle ? formatDisplayValue(subtitle, "") : "";

  const btnRef = useRef(null);
  const menuRef = useRef(null);

  /* Calculate Position */
  function calculateMenuPosition() {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuWidth = 208;
    const estimatedMenuHeight = 178;
    const gap = 8;
    const padding = 12;

    let left = rect.right - menuWidth;
    let top = rect.bottom + gap;

    if (left < padding) left = padding;
    if (left + menuWidth > window.innerWidth - padding) {
      left = window.innerWidth - menuWidth - padding;
    }
    if (top + estimatedMenuHeight > window.innerHeight - padding) {
      top = rect.top - estimatedMenuHeight - gap;
    }
    if (top < padding) top = padding;

    setMenuPosition({ top, left });
  }

  /* Open */
  function openMenu() {
    calculateMenuPosition();
    setOpen(true);
    setClosing(false);
  }

  /* Close */
  function closeMenu() {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 150);
  }

  /* Outside Click */
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (
        btnRef.current?.contains(e.target) ||
        menuRef.current?.contains(e.target)
      ) {
        return;
      }
      closeMenu();
    }

    function handleEsc(e) {
      if (e.key === "Escape") closeMenu();
    }

    function handleResize() {
      closeMenu();
    }

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEsc);
      window.addEventListener("resize", handleResize);
      window.addEventListener("scroll", handleResize, true);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [open]);

  /* Menu Portal */
  const menu =
    (open || closing) &&
    createPortal(
      <div
        ref={menuRef}
        className={`fixed z-[9999] w-52 origin-top-right rounded-xl border border-[#E5E7EB] bg-white p-1.5 shadow-xl shadow-black/[0.08] ${
          closing ? "menu-close" : "menu-open"
        }`}
        style={{
          top: `${menuPosition.top}px`,
          left: `${menuPosition.left}px`,
        }}
      >
        {/* Header */}
        <div className="mb-1.5 border-b border-[#F1F5F9] px-2.5 pb-2">
          <p className="text-[11px] font-bold text-[#0F172A]">
            {displayTitle}
          </p>
          {displaySubtitle && (
            <p className="mt-0.5 font-mono text-[10px] text-[#BCC3CD]">
              {displaySubtitle}
            </p>
          )}
        </div>

        {/* View Details */}
        {viewLink && (
          <Link
            to={viewLink}
            onClick={closeMenu}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-semibold text-[#334155] transition-all duration-150 hover:bg-[#FEF2F2] hover:text-[#B91C1C] active:scale-[0.98]"
          >
            {viewLabel}
          </Link>
        )}

        {/* 3. BAGONG CODE: Edit Patient Link Component na may State */}
        {editPatientLink && (
          <Link
            to={editPatientLink}
            state={{ startInEditMode: true }} // <--- Ipinapasa ang instruction dito
            onClick={closeMenu}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-semibold text-[#334155] transition-all duration-150 hover:bg-[#FEF2F2] hover:text-[#B91C1C] active:scale-[0.98]"
          >
            {editPatientLabel}
          </Link>
        )}

        {/* Add Health Record (using original editLink) */}
        {editLink && (
          <Link
            to={editLink}
            state={{ startInEditMode: true }} // <--- Idagdag ito
            onClick={closeMenu}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-semibold text-[#334155] transition-all duration-150 hover:bg-[#FEF2F2] hover:text-[#B91C1C] active:scale-[0.98]"
          >
            {editLabel}
          </Link>
        )}

        {/* Referral */}
        {referralLink && (
          <Link
            to={referralLink}
            onClick={closeMenu}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-semibold text-[#334155] transition-all duration-150 hover:bg-[#FEF2F2] hover:text-[#B91C1C] active:scale-[0.98]"
          >
            {referralLabel}
          </Link>
        )}
      </div>,
      document.body,
    );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? closeMenu() : openMenu())}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-200 active:scale-[0.92] ${
          open
            ? "border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]"
            : "border-[#E5E7EB] bg-white text-[#94A3B8] hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#B91C1C]"
        }`}
      >
        <MoreHorizontal size={15} />
      </button>

      {menu}
    </>
  );
}
