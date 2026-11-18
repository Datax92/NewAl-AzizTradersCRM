'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** Renders its children off-screen; printNow() prints only them, on the paper size given. */
export function Printable({ children }: { children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const d = document.createElement('div');
    d.className = 'print-root';
    document.body.appendChild(d);
    setEl(d);
    return () => d.remove();
  }, []);
  return el ? createPortal(children, el) : null;
}

export type Paper = '80mm' | '58mm' | 'A4' | 'labels';

export function printNow(paper: Paper) {
  const style = document.createElement('style');
  style.textContent =
    paper === 'A4' || paper === 'labels'
      ? '@page { size: A4; margin: 10mm; }'
      : `@page { size: ${paper} auto; margin: 0; }`;
  document.head.appendChild(style);
  document.body.classList.add('printing', 'paper-' + paper);
  const done = () => {
    document.body.classList.remove('printing', 'paper-' + paper);
    style.remove();
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  // Let the browser lay out the printable copy before the print dialog opens.
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  setTimeout(done, 60000);
}
