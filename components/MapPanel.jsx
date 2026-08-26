'use client';

/* ==========================================================================
   MapPanel.jsx, the OpenStreetMap tile mosaic and pins from the design
   ========================================================================== */

import { useRouter } from 'next/navigation';
import { S, s, cx, H } from '../lib/style.js';
import { Pressable } from './ui.jsx';
import { mapTiles, mapPins } from '../lib/seed.js';

const MONO = "'Geist Mono',monospace";

export default function MapPanel({ height = 220, top = -46, left = -42, interactive = false, pins = mapPins, radiusRing = true }) {
  const router = useRouter();
  return (
    <div style={s(`height:${height}px`, 'position:relative;overflow:hidden;background:#EDE7DF')}>
      <div
        aria-hidden="true"
        style={s(
          'position:absolute',
          `top:${top}px`,
          `left:${left}px`,
          'width:768px;height:768px;display:grid;grid-template-columns:repeat(3,256px);grid-template-rows:repeat(3,256px);filter:grayscale(1) contrast(.92) brightness(1.04)'
        )}
      >
        {mapTiles.map((t) => (
          <div key={t.url} style={s('width:256px;height:256px', `background-image:url(${t.url})`, 'background-size:256px 256px')} />
        ))}
      </div>

      {pins.map((p) =>
        interactive ? (
          <Pressable
            key={p.t}
            label={`${p.t} on the map`}
            onClick={() => router.push(`/opportunity/${p.oppId}`)}
            className={cx(H.link, H.press)}
            style={s('position:absolute', `left:${p.left}`, `top:${p.top}`, 'transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer')}
          >
            <div style={S(`padding:4px 8px;border-radius:6px;background:#fff;border:1px solid #E0D5C9;font:500 10px/1 ${MONO};color:#1A1714;white-space:nowrap;box-shadow:0 2px 6px rgba(60,40,25,.18)`)}>{p.t}</div>
            <div style={S('width:11px;height:11px;border-radius:50%;background:#C2603C;border:2px solid #fff;box-shadow:0 1px 3px rgba(60,40,25,.4)')} />
          </Pressable>
        ) : (
          <div
            key={p.t}
            style={s('position:absolute', `left:${p.left}`, `top:${p.top}`, 'transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;gap:3px')}
          >
            <div style={S(`padding:4px 8px;border-radius:6px;background:#fff;border:1px solid #E0D5C9;font:500 10px/1 ${MONO};color:#1A1714;white-space:nowrap;box-shadow:0 2px 6px rgba(60,40,25,.18)`)}>{p.t}</div>
            <div style={S('width:11px;height:11px;border-radius:50%;background:#C2603C;border:2px solid #fff;box-shadow:0 1px 3px rgba(60,40,25,.4)')} />
          </div>
        )
      )}

      {radiusRing ? (
        <div
          aria-hidden="true"
          style={S('position:absolute;left:50%;top:47%;transform:translate(-50%,-50%);width:150px;height:150px;border-radius:50%;border:1px dashed rgba(194,96,60,.55);background:rgba(194,96,60,.08)')}
        />
      ) : null}
      <div style={S(`position:absolute;bottom:8px;right:8px;padding:3px 6px;border-radius:5px;background:rgba(255,255,255,.9);font:400 9px/1 ${MONO};color:#6B635C`)}>© OpenStreetMap</div>
    </div>
  );
}

/** The single-address variant used on the opportunity detail screen. */
export function AddressMap({ address }) {
  return (
    <div style={S('height:200px;position:relative;overflow:hidden;background:#EDE7DF')}>
      <div
        aria-hidden="true"
        style={S('position:absolute;top:-60px;left:-90px;width:768px;height:768px;display:grid;grid-template-columns:repeat(3,256px);grid-template-rows:repeat(3,256px);filter:grayscale(1) contrast(.92) brightness(1.04)')}
      >
        {mapTiles.map((t) => (
          <div key={t.url} style={s('width:256px;height:256px', `background-image:url(${t.url})`, 'background-size:256px 256px')} />
        ))}
      </div>
      <div style={S('position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;gap:3px')}>
        <div style={S(`padding:5px 9px;border-radius:6px;background:#1F1B18;font:500 10px/1 ${MONO};color:#fff;white-space:nowrap`)}>{address}</div>
        <div style={S('width:12px;height:12px;border-radius:50%;background:#C2603C;border:2px solid #fff')} />
      </div>
      <div style={S(`position:absolute;bottom:8px;right:8px;padding:3px 6px;border-radius:5px;background:rgba(255,255,255,.9);font:400 9px/1 ${MONO};color:#6B635C`)}>© OpenStreetMap</div>
    </div>
  );
}
