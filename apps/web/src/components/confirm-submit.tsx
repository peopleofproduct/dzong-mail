"use client";

import type { ReactNode } from "react";

/**
 * Submit button that asks for confirmation first — for irreversible-ish
 * actions (bulk unsubscribe archives a sender's whole history). Rendered
 * inside a server-action <form>; on confirm it forwards the submission.
 */
export function ConfirmSubmitButton({
  message,
  className,
  children,
}: {
  message: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
