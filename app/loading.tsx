import Loading from './components/Loading';

// App Router route-level loading UI. Shown automatically during navigation and
// while server components (e.g. the Review queue) fetch their data.
export default function GlobalLoading() {
  return <Loading fullPage />;
}
