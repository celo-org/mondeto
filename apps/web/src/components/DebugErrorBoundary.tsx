"use client";

import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
  componentStack: string | null;
}

// Temporary diagnostic boundary for the Privy SSR/hydration debugging
// cycle. Wraps the entire app tree; when any descendant throws during
// render, the boundary logs the error + the React component stack to
// the browser console (and re-renders the children so the page still
// works if React can recover).
//
// Goal: when "Cannot read properties of undefined (reading 'current')"
// fires, we'll see exactly which component / file is on top of the
// component stack — currently the minified production stack only points
// at vendor chunks like `iX (.next/.../6419-….js)` which is useless.
//
// Remove this once the wallet path is stable.
export class DebugErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Single console.error line so it shows up in the user's DevTools
    // and in any wired-up client-side error capture (PostHog).
    console.error(
      "[DebugErrorBoundary] caught render error\n",
      "message:",
      error.message,
      "\nstack:",
      error.stack,
      "\ncomponentStack:",
      info.componentStack,
    );
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 24,
            fontFamily: "monospace",
            fontSize: 12,
            color: "#fff",
            background: "#0a0a0a",
            minHeight: "100vh",
            whiteSpace: "pre-wrap",
            overflow: "auto",
          }}
        >
          <div style={{ color: "#ff5555", fontSize: 14, marginBottom: 12 }}>
            DebugErrorBoundary caught a render error
          </div>
          <div style={{ marginBottom: 8 }}>
            <b>message:</b> {this.state.error.message}
          </div>
          <div style={{ marginBottom: 8 }}>
            <b>stack:</b>
            {"\n"}
            {this.state.error.stack}
          </div>
          <div>
            <b>componentStack:</b>
            {"\n"}
            {this.state.componentStack ?? "(none)"}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
