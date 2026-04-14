/**
 * SectionErrorBoundary — catches section-level errors
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import React from "react";
import { ErrorBoundary } from "../ErrorBoundary";

// Mock logger
jest.mock("@/lib/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("@/lib/i18n", () => ({
  L4: (_lang: string, t: { ko: string }) => t.ko,
  createT: () => (key: string, fallback?: string) => fallback ?? key,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

function BrokenChild(): React.JSX.Element {
  throw new Error("Section boom");
  return <></>;
}

describe("ErrorBoundary (section variant)", () => {
  const originalError = console.error;
  beforeAll(() => {
    console.error = jest.fn();
  });
  afterAll(() => {
    console.error = originalError;
  });

  it("renders children when no error", () => {
    render(
      <ErrorBoundary variant="section" section="Test">
        <div>OK</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("OK")).toBeInTheDocument();
  });

  it("shows section error fallback when child throws", () => {
    render(
      <ErrorBoundary variant="section" section="MySection">
        <BrokenChild />
      </ErrorBoundary>,
    );
    expect(screen.getByText("MySection Error")).toBeInTheDocument();
  });

  it("calls onError callback when error is caught", () => {
    const onError = jest.fn();
    render(
      <ErrorBoundary variant="section" section="CB" onError={onError}>
        <BrokenChild />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
