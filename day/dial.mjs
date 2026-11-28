// The day dial and the small charts. Pure: each function returns markup from plain data.
//
// The dial is the whole day on one ring: noon at the top, midnight at the bottom, morning on the
// left and evening on the right. The outer ring is the plan (sleep window, work, meals, study,
// trading); the inner ring is what happened (last night's sleep, or the night so far). The hand is now.

import { fromMin, fmtDur, esc, minuteOfDay, clamp } from './core.mjs';

const C = 160, R = 132, RI = 109, W = 16;
const ang = m => ((m - 720) / 1440) * Math.PI * 2;
const pt = (r, m) => [C + r * Math.sin(ang(m)), C - r * Math.cos(ang(m))];
const f = n => n.toFixed(1);
/** Clockwise arc from day-minute m0 to m1 (m1 may pass midnight). */
function arcPath(r, m0, m1) {
  let span = ((m1 - m0) % 1440 + 1440) % 1440;
  if (span < 1) return '';
  const [x0, y0] = pt(r, m0), [x1, y1] = pt(r, m0 + span);
  return `M${f(x0)} ${f(y0)}A${r} ${r} 0 ${span > 720 ? 1 : 0} 1 ${f(x1)} ${f(y1)}`;
}
const range = (a, b) => `${fromMin(a)}–${fromMin(b)}`;
function seg(cls, r, m0, m1, tip, width = W) {
  const gap = m1 - m0 > 24 ? 3 : 0;                 // a 2 px surface gap between neighbouring marks
  const d = arcPath(r, m0 + gap, m1 - gap);
  return d ? `<path class="arc ${cls}" d="${d}" stroke-width="${width}" data-tip="${esc(tip)}"><title>${esc(tip)}</title></path>` : '';
}

/**
 * items: the day's schedule (core.buildDay); minute: now as a day-minute; bed, wake: target times
 * as day-minutes; night: {bed, wake} (ms) of the night to draw on the inner ring, or null.
 */
export function dial({ items, minute, bed, wake, night, center = '', sub = '' }) {
  const out = [];
  out.push(`<circle class="track" cx="${C}" cy="${C}" r="${R}" stroke-width="${W}" fill="none"/>`);
  out.push(`<circle class="track inner" cx="${C}" cy="${C}" r="${RI}" stroke-width="6" fill="none"/>`);
  for (let h = 0; h < 24; h++) {
    const big = h % 6 === 0, [x0, y0] = pt(R + W / 2 + 3, h * 60), [x1, y1] = pt(R + W / 2 + (big ? 10 : 6), h * 60);
    out.push(`<line class="tick${big ? ' big' : ''}" x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}"/>`);
  }
  for (const h of [0, 6, 12, 18]) {
    const [x, y] = pt(RI - 17, h * 60);
    out.push(`<text class="hour" x="${f(x)}" y="${f(y)}" dominant-baseline="central" text-anchor="middle">${String(h).padStart(2, '0')}</text>`);
  }
  out.push(seg('k-sleep plan', R, bed, wake, `Sleep window ${range(bed, wake)}`));
  for (const it of items) {
    if (it.kind === 'work' && it.end) out.push(seg('k-work', R, it.start, it.end, `${it.title} ${range(it.start, it.end)}`));
    else if (it.kind === 'study' && it.end) out.push(seg('k-study', R, it.start, it.end, `${it.title} ${range(it.start, it.end)}`));
    else if (it.kind === 'trade' && it.end) out.push(seg('k-trade', R, it.start, it.end, `${it.title} ${range(it.start, it.end)}`));
    else if (it.kind === 'cook') out.push(seg('k-cook' + (it.done ? ' done' : ''), R, it.start - 15, it.start + 25, `${it.title} at ${fromMin(it.start)}${it.sub ? ': ' + it.sub : ''}`));
  }
  if (night && night.bed) {
    const b = minuteOfDay(night.bed), w = night.wake ? minuteOfDay(night.wake) : minute % 1440;
    out.push(seg('k-sleep actual', RI, b, w, night.wake ? `Slept ${range(b, w)}` : `In bed since ${fromMin(b)}`, 6));
  }
  for (const it of items) {
    if (it.kind === 'prep') {
      const [x, y] = pt(R, it.start), tip = `${fromMin(it.start)} ${it.title}`;
      out.push(`<circle class="dot k-prep${it.done ? ' done' : ''}" cx="${f(x)}" cy="${f(y)}" r="5.5" data-tip="${esc(tip)}"><title>${esc(tip)}</title></circle>`);
    } else if (it.kind === 'review') {
      const [x0, y0] = pt(R - W / 2, it.start), [x1, y1] = pt(R + W / 2, it.start);
      out.push(`<line class="mark" x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}"><title>Review the day at ${fromMin(it.start)}</title></line>`);
    }
  }
  const [hx0, hy0] = pt(RI - 7, minute), [hx1, hy1] = pt(R + W / 2 + 4, minute), [dx, dy] = pt(R, minute);
  out.push(`<line class="hand" x1="${f(hx0)}" y1="${f(hy0)}" x2="${f(hx1)}" y2="${f(hy1)}"/><circle class="hand-dot" cx="${f(dx)}" cy="${f(dy)}" r="5"/>`);
  out.push(`<text class="dial-time" x="${C}" y="${C - 6}" text-anchor="middle" data-clock="hm">${esc(center)}</text>`);
  out.push(`<text class="dial-sub" x="${C}" y="${C + 24}" text-anchor="middle" data-dial-sub>${esc(sub)}</text>`);
  return `<svg class="dial" viewBox="0 0 320 320" role="img" aria-label="Today on a 24-hour dial">${out.join('')}</svg>`;
}

/* ------------------------------------------------------------------ sleep, night by night */
// Rows of bars on a 20:00 → 12:00 axis (16 hours); dashed lines mark the target bed and wake times.
const AX0 = 20 * 60, AXN = 16 * 60;
const xPctMin = m => clamp((((m - AX0) % 1440) + 1440) % 1440 / AXN * 100, 0, 100);
const xPct = t => xPctMin(minuteOfDay(t));
export function sleepChart(list, { bed, wake, goal, days, fmtDay }) {
  const by = new Map(list.map(n => [n.date, n]));
  const rows = days.map(d => {
    const n = by.get(d), label = esc(fmtDay(d));
    if (!n) return `<li class="sl-row empty"><span class="sl-day">${label}</span><span class="sl-track"></span><span class="sl-dur">–</span></li>`;
    const tip = n.bed ? `${fmtDay(d)}: ${fromMin(minuteOfDay(n.bed))} to ${fromMin(minuteOfDay(n.wake))}, ${fmtDur(n.mins)}` : `${fmtDay(d)}: woke at ${fromMin(minuteOfDay(n.wake))}, bedtime not logged`;
    const bar = n.bed ? `<i class="sl-bar${n.mins < goal - 30 ? ' short' : ''}" style="left:${f(xPct(n.bed))}%;width:${f(Math.max(1.5, xPct(n.wake) - xPct(n.bed)))}%"></i>`
      : `<i class="sl-wake" style="left:${f(xPct(n.wake))}%"></i>`;
    return `<li class="sl-row"><button type="button" class="sl-hit" data-act="sleep-edit" data-id="${esc(n.id)}" title="${esc(tip)}" aria-label="${esc(tip)}. Edit"></button><span class="sl-day">${label}</span><span class="sl-track">${bar}</span><span class="sl-dur">${n.mins ? fmtDur(n.mins, true) : '?'}</span></li>`;
  }).join('');
  const ticks = [20, 22, 0, 2, 4, 6, 8, 10, 12].map(h => `<span style="left:${f(xPctMin(h * 60))}%">${String(h).padStart(2, '0')}</span>`).join('');
  return `<div class="sleep-chart"><div class="sl-axis"><span class="sl-day"></span><span class="sl-ticks">${ticks}</span><span class="sl-dur"></span></div>
    <ol class="sl-rows" style="--bed:${f(xPctMin(bed))}%;--wake:${f(xPctMin(wake))}%">${rows}</ol>
    <p class="chart-note"><i class="key-target"></i> Dashed lines: your ${fromMin(bed)} bedtime and ${fromMin(wake)} wake-up. Tap a night to edit it.</p></div>`;
}

/* ------------------------------------------------------------------ one bar per day */
export function dayBars(values, { days, fmtDay, unit = '', fmtVal = v => String(v), cls = '', goal = null, title = '' }) {
  const max = Math.max(1, goal || 0, ...values.map(v => v || 0));
  const cols = days.map((d, i) => {
    const v = values[i], h = v ? Math.max(3, v / max * 100) : 0, tip = `${fmtDay(d)}: ${v == null ? 'nothing logged' : fmtVal(v) + unit}`;
    return `<li title="${esc(tip)}"><span class="bar-track"><i class="bar ${cls}" style="height:${f(h)}%"></i></span><span class="bar-day">${esc(fmtDay(d).slice(0, 2))}</span><span class="sr-only">${esc(tip)}</span></li>`;
  }).join('');
  const g = goal ? ` class="has-goal" style="--goal:${f(goal / max * 100)}%"` : '';
  return `<figure class="day-bars"><figcaption>${esc(title)}${goal ? ` <span class="muted">(dashed line: goal ${esc(fmtVal(goal) + unit)})</span>` : ''}</figcaption><ol${g}>${cols}</ol></figure>`;
}

/* ------------------------------------------------------------------ a line for weight */
export function spark(points, { w = 160, h = 40 } = {}) {
  if (points.length < 2) return '';
  const ys = points.map(p => p.v), lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
  const t0 = points[0].t, tn = points[points.length - 1].t || t0 + 1;
  const xy = points.map(p => [((p.t - t0) / (tn - t0 || 1)) * (w - 8) + 4, h - 4 - ((p.v - lo) / span) * (h - 8)]);
  const last = xy[xy.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${xy.map(p => p.map(f).join(',')).join(' ')}"/><circle cx="${f(last[0])}" cy="${f(last[1])}" r="3.5"/></svg>`;
}

/* ------------------------------------------------------------------ small progress meter */
export function meter(value, max, cls = '') {
  const p = max ? clamp(value / max * 100, 0, 100) : 0;
  return `<span class="meter ${cls}" role="img" aria-label="${Math.round(value)} of ${Math.round(max)}"><i style="width:${f(p)}%"></i></span>`;
}
