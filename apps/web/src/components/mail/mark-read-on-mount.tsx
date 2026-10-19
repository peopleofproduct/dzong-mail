"use client";

import { useEffect } from "react";

interface MarkReadOnMountProps {
  ids: string[];
  action: (ids: string[], read?: boolean) => Promise<void>;
}

/** Fires once when a thread renders: marks its unread messages as read. */
export function MarkReadOnMount({ ids, action }: MarkReadOnMountProps) {
  useEffect(() => {
    if (ids.length > 0) void action(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
