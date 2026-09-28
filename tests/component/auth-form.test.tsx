import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { AuthForm } from "@/app/(auth)/login/auth-form";

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// jsdom throws on real navigation, so the ?next= redirect cases swap in a fake
// window.location carrying the query string and an assign() spy.
function fakeLocation(search: string) {
  const original = window.location;
  const assign = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...original, search, assign },
  });
  return { assign, restore: () => Object.defineProperty(window, "location", { configurable: true, value: original }) };
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, mode: "login" | "register") {
  if (mode === "register") await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");
  await user.type(screen.getByLabelText("Email"), "ada@example.com");
  await user.type(screen.getByLabelText("Password"), "s3cretpass");
  await user.click(screen.getByRole("button"));
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AuthForm", () => {
  it("renders login mode without a name field and with a Sign In button", () => {
    render(<AuthForm mode="login" />);
    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeEnabled();
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
  });

  it("renders register mode with a name field and stricter password rules", () => {
    render(<AuthForm mode="register" />);
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register" })).toBeInTheDocument();
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("minlength", "8");
    expect(password).toHaveAttribute("autocomplete", "new-password");
  });

  it("posts login credentials as JSON to /api/auth/login and navigates home", async () => {
    const { assign, restore } = fakeLocation("");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: { id: 1 } }));
    const user = userEvent.setup();
    render(<AuthForm mode="login" />);
    await fillAndSubmit(user, "login");
    // Full page load so the fresh session renders server-side (no stale router cache).
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
    restore();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/login");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ email: "ada@example.com", password: "s3cretpass" });
  });

  it("includes the name and targets /api/auth/register in register mode", async () => {
    const { assign, restore } = fakeLocation("");
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { user: { id: 1 } }));
    const user = userEvent.setup();
    render(<AuthForm mode="register" />);
    await fillAndSubmit(user, "register");
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
    restore();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/register");
    expect(JSON.parse(init.body)).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "s3cretpass",
    });
  });

  it("shows the server's error message on a rejected login and stays usable", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: "Invalid email or password." }));
    const user = userEvent.setup();
    render(<AuthForm mode="login" />);
    await fillAndSubmit(user, "login");
    expect(await screen.findByText("Invalid email or password.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeEnabled(); // can retry
  });

  it("falls back to a generic message when the error response has no JSON body", async () => {
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 500 }));
    const user = userEvent.setup();
    render(<AuthForm mode="login" />);
    await fillAndSubmit(user, "login");
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
  });

  it("shows a network error when fetch rejects", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("failed to fetch"));
    const user = userEvent.setup();
    render(<AuthForm mode="login" />);
    await fillAndSubmit(user, "login");
    expect(await screen.findByText("Network error. Please try again.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("clears a previous error on the next successful submit", async () => {
    const { assign, restore } = fakeLocation("");
    try {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(401, { error: "Invalid email or password." }))
        .mockResolvedValueOnce(jsonResponse(200, { user: { id: 1 } }));
      const user = userEvent.setup();
      render(<AuthForm mode="login" />);
      await fillAndSubmit(user, "login");
      expect(await screen.findByText("Invalid email or password.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Sign In" }));
      await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
      expect(screen.queryByText("Invalid email or password.")).not.toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it("disables the button and shows a pending label while the request is in flight", async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<AuthForm mode="login" />);
    await fillAndSubmit(user, "login");
    const pending = screen.getByRole("button", { name: "Please wait…" });
    expect(pending).toBeDisabled();
    resolve(jsonResponse(200, { user: { id: 1 } }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign In" })).toBeEnabled());
  });

  it("follows a same-site ?next= path after login instead of pushing home", async () => {
    const { assign, restore } = fakeLocation("?next=%2Fadmin%2Fqueues");
    try {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: { id: 1 } }));
      const user = userEvent.setup();
      render(<AuthForm mode="login" />);
      await fillAndSubmit(user, "login");
      await waitFor(() => expect(assign).toHaveBeenCalledWith("/admin/queues"));
      expect(push).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("sends an admin login to /admin instead of the storefront", async () => {
    const { assign, restore } = fakeLocation("");
    try {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: { id: 1 }, isAdmin: true }));
      const user = userEvent.setup();
      render(<AuthForm mode="login" />);
      await fillAndSubmit(user, "login");
      await waitFor(() => expect(assign).toHaveBeenCalledWith("/admin"));
      expect(push).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it.each(["https://evil.example", "//evil.example"])(
    "ignores an unsafe ?next= value (%s) and goes home instead",
    async (next) => {
      const { assign, restore } = fakeLocation(`?next=${encodeURIComponent(next)}`);
      try {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: { id: 1 } }));
        const user = userEvent.setup();
        render(<AuthForm mode="login" />);
        await fillAndSubmit(user, "login");
        await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
        expect(assign).not.toHaveBeenCalledWith(next);
      } finally {
        restore();
      }
    },
  );
});
