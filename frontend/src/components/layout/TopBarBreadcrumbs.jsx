import { Link } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FOCUS_RING } from "./sidebar/sidebarStyles";

const CRUMB_LINK = `text-gray-500 transition-colors hover:text-gray-900 hover:underline ${FOCUS_RING}`;

export default function TopBarBreadcrumbs({ crumbs }) {
  const current = crumbs[crumbs.length - 1];
  const parents = crumbs.slice(0, -1);
  const backTarget = parents[parents.length - 1];

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-3">
      <span className="h-6 w-1 shrink-0 bg-red-600" aria-hidden="true" />

      {/* Phone: current page, with a back link to the immediate parent */}
      <div className="min-w-0 sm:hidden">
        {backTarget && (
          <Link
            to={backTarget.path}
            className={`flex items-center text-[11px] font-medium leading-tight ${CRUMB_LINK}`}
          >
            <ChevronLeft size={12} className="shrink-0" />
            <span className="truncate">{backTarget.label}</span>
          </Link>
        )}
        <h2
          className="truncate text-sm font-bold leading-tight text-gray-900"
          aria-current="page"
        >
          {current.label}
        </h2>
      </div>

      {/* Tablet and up: full trail */}
      <ol className="hidden min-w-0 items-center gap-1.5 sm:flex">
        {parents.map((crumb) => (
          <li key={crumb.path} className="flex shrink-0 items-center gap-1.5">
            <Link to={crumb.path} className={`text-sm font-medium ${CRUMB_LINK}`}>
              {crumb.label}
            </Link>
            <ChevronRight size={14} className="shrink-0 text-gray-400" aria-hidden="true" />
          </li>
        ))}
        <li className="min-w-0">
          <h2
            className="truncate text-base font-bold tracking-tight text-gray-900"
            aria-current="page"
          >
            {current.label}
          </h2>
        </li>
      </ol>
    </nav>
  );
}
