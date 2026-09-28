import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { StatusPoller } from "@/app/orders/[publicId]/status-poller";

beforeEach(() => {
  refresh.mockClear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("StatusPoller", () => {
  it("refreshes the page every 2 seconds", () => {
    render(<StatusPoller />);
    vi.advanceTimersByTime(6_000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("stops polling after 60 polls (~2 minutes)", () => {
    render(<StatusPoller />);
    vi.advanceTimersByTime(10 * 60_000);
    expect(refresh).toHaveBeenCalledTimes(60);
  });

  it("clears its timer on unmount (no refresh after navigation)", () => {
    const { unmount } = render(<StatusPoller />);
    vi.advanceTimersByTime(2_000);
    unmount();
    vi.advanceTimersByTime(10_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("renders nothing visible", () => {
    const { container } = render(<StatusPoller />);
    expect(container).toBeEmptyDOMElement();
  });
});
