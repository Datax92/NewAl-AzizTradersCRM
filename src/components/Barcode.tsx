'use client';

import React from 'react';
import { barcodeSVG } from '../lib/barcode';

export function BarcodeSVG({ value, height = 40, showText = true, module = 1.4 }: { value: string; height?: number; showText?: boolean; module?: number }) {
  if (!value) return null;
  const { width, rects } = barcodeSVG(value, height, module);
  const th = showText ? 12 : 0;
  return (
    <svg className="barcode" viewBox={`0 0 ${width} ${height + th}`} width={width} height={height + th} role="img" aria-label={`Barcode ${value}`}>
      <rect width={width} height={height + th} fill="#fff" />
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={0} width={r.w} height={height} fill="#000" />
      ))}
      {showText && (
        <text x={width / 2} y={height + 10} textAnchor="middle" fontSize="10" fontFamily="monospace" fill="#000">
          {value}
        </text>
      )}
    </svg>
  );
}
