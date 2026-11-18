'use client';

import React, { useMemo, useState } from 'react';
import { rs } from '../lib/format';

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function short(v: number) {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1e7) return s + (a / 1e7).toFixed(a >= 1e8 ? 0 : 1) + ' Cr';
  if (a >= 1e5) return s + (a / 1e5).toFixed(a >= 1e6 ? 0 : 1) + ' L';
  if (a >= 1e3) return s + (a / 1e3).toFixed(0) + 'k';
  return s + Math.round(a);
}

export interface BarDatum {
  label: string;
  value: number;
  tip?: React.ReactNode;
}

/** Columns on one axis. `signed` paints positive green and negative red, with a zero line. */
export function Bars({ data, color = 'var(--s1)', signed, height = 220, labelEvery }: { data: BarDatum[]; color?: string; signed?: boolean; height?: number; labelEvery?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = height, L = 46, R = 8, T = 10, B = 26;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const minRaw = Math.min(0, ...data.map((d) => d.value));
  const min = minRaw < 0 ? -niceMax(-minRaw) : 0;
  const span = max - min || 1;
  const y = (v: number) => T + ((max - v) / span) * (H - T - B);
  const bw = (W - L - R) / Math.max(1, data.length);
  const gap = Math.min(2, bw * 0.2);
  const every = labelEvery || Math.ceil(data.length / 10);
  const ticks = [max, max / 2, 0, ...(min < 0 ? [min / 2, min] : [])].filter((v, i, a) => a.indexOf(v) === i);
  const h = hover !== null ? data[hover] : null;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bar chart" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className={t === 0 ? 'axline' : 'gridline'} />
            <text x={L - 6} y={y(t) + 3.5} textAnchor="end" className="ax">
              {short(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = L + i * bw + gap / 2;
          const top = y(Math.max(0, d.value));
          const bot = y(Math.min(0, d.value));
          const fill = signed ? (d.value >= 0 ? 'var(--good)' : 'var(--bad)') : color;
          const hgt = Math.max(d.value ? 1.5 : 0, bot - top);
          const r = Math.min(4, (bw - gap) / 2, hgt);
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={L + i * bw} y={T} width={bw} height={H - T - B} fill="transparent" />
              {d.value >= 0 ? (
                <path d={`M${x},${bot} V${top + r} q0,-${r} ${r},-${r} H${x + bw - gap - r} q${r},0 ${r},${r} V${bot} Z`} fill={fill} opacity={hover === null || hover === i ? 1 : 0.45} />
              ) : (
                <path d={`M${x},${top} V${bot - r} q0,${r} ${r},${r} H${x + bw - gap - r} q${r},0 ${r},-${r} V${top} Z`} fill={fill} opacity={hover === null || hover === i ? 1 : 0.45} />
              )}
              {(i % every === 0 || i === data.length - 1) && (
                <text x={L + i * bw + bw / 2} y={H - 8} textAnchor="middle" className="ax">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {h && hover !== null && (
        <div className="ctip" style={{ left: `${((L + hover * bw + bw / 2) / W) * 100}%` }}>
          <b>{h.label}</b>
          {h.tip || <span className={signed ? (h.value >= 0 ? 'good' : 'bad') : ''}>{rs(h.value)}</span>}
        </div>
      )}
    </div>
  );
}

export interface Slice {
  label: string;
  value: number;
  color: string;
}

export function Donut({ data, center, sub }: { data: Slice[]; center?: React.ReactNode; sub?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((a, d) => a + Math.max(0, d.value), 0);
  const arcs = useMemo(() => {
    let a0 = -Math.PI / 2;
    return data.map((d) => {
      const frac = total ? Math.max(0, d.value) / total : 0;
      const a1 = a0 + frac * Math.PI * 2;
      const arc = { a0, a1, frac };
      a0 = a1;
      return arc;
    });
  }, [data, total]);
  const R = 70, r = 46, C = 80;
  const pt = (a: number, rad: number) => `${C + Math.cos(a) * rad},${C + Math.sin(a) * rad}`;
  const h = hover !== null ? data[hover] : null;
  return (
    <div className="donut">
      <svg viewBox="0 0 160 160" width={160} height={160} role="img" aria-label="Share chart" onMouseLeave={() => setHover(null)}>
        {total === 0 && <circle cx={C} cy={C} r={(R + r) / 2} fill="none" stroke="var(--rule)" strokeWidth={R - r} />}
        {arcs.map((a, i) => {
          if (a.frac <= 0) return null;
          if (a.frac >= 0.9999)
            return <circle key={i} cx={C} cy={C} r={(R + r) / 2} fill="none" stroke={data[i].color} strokeWidth={R - r} onMouseEnter={() => setHover(i)} />;
          const large = a.a1 - a.a0 > Math.PI ? 1 : 0;
          const pad = 0.012;
          const s = a.a0 + pad, e = a.a1 - pad;
          return (
            <path
              key={i}
              d={`M${pt(s, R)} A${R},${R} 0 ${large} 1 ${pt(e, R)} L${pt(e, r)} A${r},${r} 0 ${large} 0 ${pt(s, r)} Z`}
              fill={data[i].color}
              opacity={hover === null || hover === i ? 1 : 0.4}
              onMouseEnter={() => setHover(i)}
            />
          );
        })}
        <text x={C} y={C - 2} textAnchor="middle" className="donut-c">
          {h ? `${((Math.max(0, h.value) / (total || 1)) * 100).toFixed(0)}%` : center}
        </text>
        <text x={C} y={C + 15} textAnchor="middle" className="ax">
          {h ? h.label : sub}
        </text>
      </svg>
      <div className="legend col">
        {data.map((d, i) => (
          <div key={d.label} className={`it ${hover === i ? 'on' : ''}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="sw" style={{ background: d.color }} />
            <span className="nm">{d.label}</span>
            <b>{rs(d.value)}</b>
            <small>{total ? ((Math.max(0, d.value) / total) * 100).toFixed(0) : 0}%</small>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ranked horizontal bars — label, bar, value. */
export function RankBars({ data, color = 'var(--s1)', fmt = rs, signed, onClick }: { data: { id?: string; label: string; value: number; sub?: string }[]; color?: string; fmt?: (n: number) => string; signed?: boolean; onClick?: (id: string) => void }) {
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  return (
    <div className="rank">
      {data.map((d, i) => {
        const Row: any = onClick && d.id ? 'button' : 'div';
        return (
          <Row key={d.label + i} className="rank-r" onClick={onClick && d.id ? () => onClick(d.id!) : undefined}>
            <span className="rank-n">{i + 1}</span>
            <span className="rank-l">
              <span className="nm">{d.label}</span>
              {d.sub && <small>{d.sub}</small>}
              <span className="bar">
                <i style={{ width: `${(Math.abs(d.value) / max) * 100}%`, background: signed ? (d.value >= 0 ? 'var(--good)' : 'var(--bad)') : color }} />
              </span>
            </span>
            <b className={signed ? (d.value >= 0 ? 'good' : 'bad') : ''}>{fmt(d.value)}</b>
          </Row>
        );
      })}
    </div>
  );
}

/** Two figures side by side as a split meter (e.g. stock at cost vs. profit on top). */
export function Meter({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1;
  return (
    <div className="meter">
      <div className="meter-bar">
        {parts.map((p) => (
          <i key={p.label} style={{ width: `${(Math.max(0, p.value) / total) * 100}%`, background: p.color }} title={`${p.label}: ${rs(p.value)}`} />
        ))}
      </div>
      <div className="legend">
        {parts.map((p) => (
          <span key={p.label} className="it">
            <span className="sw" style={{ background: p.color }} />
            {p.label} <b>{rs(p.value)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
