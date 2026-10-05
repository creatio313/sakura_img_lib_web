"use client";

import { useState } from "react";

export type Notice = { id: number; message: string; error?: boolean; visible: boolean };

export function useNotices() {
  const [notices, setNotices] = useState<Notice[]>([]);

  function notify(message: string, error = false) {
    const id = Date.now();
    setNotices((items) => [...items, { id, message, error, visible: true }]);
    window.setTimeout(() => {
      dismiss(id);
    }, 5000);
  }

  function dismiss(id: number) {
    setNotices((items) => items.map((item) => (item.id === id ? { ...item, visible: false } : item)));
    window.setTimeout(() => {
      setNotices((items) => items.filter((item) => item.id !== id));
    }, 150);
  }

  return { notices, notify, dismiss };
}