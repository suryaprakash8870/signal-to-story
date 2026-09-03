// Reusable loading indicator - the one loading UI used across every page and
// route transition. No hooks, so it can be imported by both server and client
// components (and by app/loading.tsx for route transitions).
//
// `fullPage` centers it in the full viewport height (route-level loads);
// otherwise it sits inline at a fixed height (loading a section of a page).
export default function Loading({
  label = 'Loading…',
  fullPage = false,
}: {
  label?: string;
  fullPage?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 text-sm text-gray-500 ${
        fullPage ? 'h-full min-h-[50vh]' : 'py-16'
      }`}
    >
      <span className="relative flex h-9 w-9 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-accent/25" />
        <svg className="relative h-6 w-6 animate-spin text-accent" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </span>
      <span>{label}</span>
    </div>
  );
}
