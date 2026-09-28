// Unlike layout.tsx, a template remounts on every navigation, so each page gets a
// short fade/slide-in instead of swapping abruptly. Pure CSS (see .mm-page in globals.css).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="mm-page">{children}</div>;
}
