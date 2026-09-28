// Server side of the header auth widget: reads the session cookie and renders
// either a Sign in link or the user's name with a logout button.
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { LogoutButton } from "./logout-button";

export async function HeaderAuth() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <li className="nav-item">
        <Link href="/login" className="nav-link">
          <i className="fas fa-user mr-1" /> Sign in
        </Link>
      </li>
    );
  }
  return (
    <>
      <li className="nav-item">
        <span className="nav-link">
          <i className="fas fa-user-circle mr-1" /> {user.name}
        </span>
      </li>
      <li className="nav-item">
        <LogoutButton />
      </li>
    </>
  );
}
