"use client";

import { memo, useEffect, useRef, useState } from "react";
import getStroke from "perfect-freehand";
import type { EssayPage } from "@/components/essay/useEssayPages";
import { ESSAY_STAMPS, type EssayAnnotations, type EssayMark, type EssayStampKind } from "@/utils/essayTypes";

export type AnnotationTool = "hand" | "pen" | "highlighter" | "text" | "stamp" | "eraser";

/** Bề rộng hệ tọa độ SVG; tọa độ lưu là tỉ lệ 0–1 nên đổi số này không ảnh hưởng dữ liệu. */
const VIEW_WIDTH = 1000;
const PEN_SIZE = 0.0045;
const HIGHLIGHTER_SIZE = 0.022;
const TEXT_SIZE = 0.03;

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function strokePath(points: Array<[number, number, number]>, ratio: number, size: number, simulatePressure: boolean): string {
  const outline = getStroke(points.map(([x, y, pressure]) => [x * VIEW_WIDTH, y * VIEW_WIDTH * ratio, pressure]), {
    size: size * VIEW_WIDTH,
    thinning: 0.55,
    smoothing: 0.5,
    streamline: 0.45,
    simulatePressure,
  });
  if (!outline.length) return "";
  const d = outline.reduce<(string | number)[]>((acc, [x0, y0], index, array) => {
    const [x1, y1] = array[(index + 1) % array.length];
    acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    return acc;
  }, ["M", ...outline[0], "Q"]);
  return `${d.join(" ")} Z`;
}

function highlighterPath(points: Array<[number, number, number]>, ratio: number): string {
  return points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x * VIEW_WIDTH} ${y * VIEW_WIDTH * ratio}`).join(" ");
}

function StampGlyph({ mark, ratio }: { mark: Extract<EssayMark, { kind: "stamp" }>; ratio: number }) {
  const x = mark.x * VIEW_WIDTH;
  const y = mark.y * VIEW_WIDTH * ratio;
  if (mark.stamp === "check") {
    return <path d={`M${x - 16} ${y} l11 13 l24 -30`} fill="none" stroke={mark.color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />;
  }
  if (mark.stamp === "cross") {
    return <path d={`M${x - 13} ${y - 13} l26 26 M${x + 13} ${y - 13} l-26 26`} fill="none" stroke={mark.color} strokeWidth={6} strokeLinecap="round" />;
  }
  return <text x={x} y={y} fill={mark.color} fontSize={34} fontWeight={800} textAnchor="middle" dominantBaseline="middle" fontFamily="system-ui, sans-serif">{ESSAY_STAMPS[mark.stamp].label}</text>;
}

const MarkView = memo(function MarkView({ mark, ratio }: { mark: EssayMark; ratio: number }) {
  if (mark.kind === "pen") return <path d={strokePath(mark.points, ratio, mark.size, mark.points.every((point) => point[2] === 0.5))} fill={mark.color} />;
  if (mark.kind === "highlighter") {
    return <path d={highlighterPath(mark.points, ratio)} fill="none" stroke={mark.color} strokeOpacity={0.35} strokeWidth={mark.size * VIEW_WIDTH} strokeLinecap="round" strokeLinejoin="round" />;
  }
  if (mark.kind === "text") {
    return (
      <text x={mark.x * VIEW_WIDTH} y={mark.y * VIEW_WIDTH * ratio} fill={mark.color} fontSize={mark.size * VIEW_WIDTH} fontWeight={600} dominantBaseline="hanging" fontFamily="system-ui, sans-serif">
        {mark.text.split("\n").map((line, index) => <tspan key={index} x={mark.x * VIEW_WIDTH} dy={index === 0 ? 0 : mark.size * VIEW_WIDTH * 1.2}>{line}</tspan>)}
      </text>
    );
  }
  return <StampGlyph mark={mark} ratio={ratio} />;
});

interface PageProps {
  page: EssayPage;
  marks: EssayMark[];
  tool: AnnotationTool;
  color: string;
  stamp: EssayStampKind;
  penOnly: boolean;
  readOnly: boolean;
  onAdd: (pageKey: string, mark: EssayMark) => void;
  onRemove: (pageKey: string, markId: string) => void;
}

const AnnotatedPage = memo(function AnnotatedPage({ page, marks, tool, color, stamp, penOnly, readOnly, onAdd, onRemove }: PageProps) {
  const ratio = page.height / page.width;
  const svgRef = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<{ points: Array<[number, number, number]>; pressure: boolean } | null>(null);
  const [pendingText, setPendingText] = useState<{ x: number; y: number; value: string } | null>(null);
  const drawing = !readOnly && (tool === "pen" || tool === "highlighter");
  const interactive = !readOnly && tool !== "hand";

  // iPad: khi "chỉ vẽ bằng bút", ngón tay vẫn cuộn trang còn Apple Pencil thì vẽ.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !drawing || !penOnly) return;
    const handler = (event: TouchEvent) => {
      const touches = Array.from(event.touches) as Array<Touch & { touchType?: string }>;
      if (touches.length > 0 && touches.every((touch) => touch.touchType === "stylus")) event.preventDefault();
    };
    svg.addEventListener("touchstart", handler, { passive: false });
    svg.addEventListener("touchmove", handler, { passive: false });
    return () => {
      svg.removeEventListener("touchstart", handler);
      svg.removeEventListener("touchmove", handler);
    };
  }, [drawing, penOnly]);

  const point = (event: React.PointerEvent): [number, number, number] => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    return [Number(x.toFixed(4)), Number(y.toFixed(4)), event.pointerType === "pen" ? Number(event.pressure.toFixed(2)) || 0.5 : 0.5];
  };

  const handleDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive || event.button > 0) return;
    if (penOnly && event.pointerType === "touch" && tool !== "eraser") return;
    if (drawing) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDraft({ points: [point(event)], pressure: event.pointerType === "pen" });
      return;
    }
    const [x, y] = point(event);
    if (tool === "stamp") {
      onAdd(page.key, { id: newId(), kind: "stamp", x, y, stamp, color });
    } else if (tool === "text") {
      event.preventDefault();
      setPendingText({ x, y, value: "" });
    }
  };

  const handleMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!draft) return;
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    const rect = svgRef.current!.getBoundingClientRect();
    const added = events.map((item): [number, number, number] => [
      Number(Math.min(1, Math.max(0, (item.clientX - rect.left) / rect.width)).toFixed(4)),
      Number(Math.min(1, Math.max(0, (item.clientY - rect.top) / rect.height)).toFixed(4)),
      item.pointerType === "pen" ? Number(item.pressure.toFixed(2)) || 0.5 : 0.5,
    ]);
    setDraft((current) => current ? { ...current, points: [...current.points, ...added] } : current);
  };

  const handleUp = () => {
    if (!draft) return;
    if (draft.points.length > 1 || tool === "pen") {
      onAdd(page.key, tool === "highlighter"
        ? { id: newId(), kind: "highlighter", color: "#facc15", size: HIGHLIGHTER_SIZE, points: draft.points }
        : { id: newId(), kind: "pen", color, size: PEN_SIZE, points: draft.points });
    }
    setDraft(null);
  };

  const commitText = () => {
    if (pendingText?.value.trim()) {
      onAdd(page.key, { id: newId(), kind: "text", x: pendingText.x, y: pendingText.y, text: pendingText.value.trim().slice(0, 500), color, size: TEXT_SIZE });
    }
    setPendingText(null);
  };

  return (
    <figure className="relative mx-auto w-full bg-white shadow-[0_1px_3px_rgb(16_24_40/.12),0_8px_24px_-12px_rgb(16_24_40/.25)]" style={{ aspectRatio: `${page.width} / ${page.height}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={page.src} alt={page.label} draggable={false} className="absolute inset-0 h-full w-full select-none object-contain" />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_WIDTH * ratio}`}
        className="absolute inset-0 h-full w-full"
        style={{
          touchAction: interactive && !penOnly ? "none" : "auto",
          pointerEvents: interactive || readOnly ? "auto" : "none",
          cursor: tool === "text" ? "text" : drawing || tool === "stamp" ? "crosshair" : tool === "eraser" ? "cell" : "default",
        }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={() => setDraft(null)}
      >
        {marks.map((mark) => (
          <g
            key={mark.id}
            data-mark={mark.id}
            style={{ pointerEvents: tool === "eraser" && !readOnly ? "visiblePainted" : "none", cursor: tool === "eraser" ? "pointer" : undefined }}
            onPointerDown={(event) => { if (tool === "eraser" && !readOnly) { event.stopPropagation(); onRemove(page.key, mark.id); } }}
            onPointerEnter={(event) => { if (tool === "eraser" && !readOnly && event.buttons === 1) onRemove(page.key, mark.id); }}
          >
            <MarkView mark={mark} ratio={ratio} />
          </g>
        ))}
        {draft && (tool === "highlighter"
          ? <path d={highlighterPath(draft.points, ratio)} fill="none" stroke="#facc15" strokeOpacity={0.35} strokeWidth={HIGHLIGHTER_SIZE * VIEW_WIDTH} strokeLinecap="round" strokeLinejoin="round" />
          : <path d={strokePath(draft.points, ratio, PEN_SIZE, !draft.pressure)} fill={color} />)}
      </svg>
      {pendingText && (
        <textarea
          autoFocus
          value={pendingText.value}
          onChange={(event) => setPendingText({ ...pendingText, value: event.target.value })}
          onBlur={commitText}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); commitText(); }
            if (event.key === "Escape") setPendingText(null);
          }}
          rows={2}
          aria-label="Nhận xét trên bài"
          placeholder="Nhận xét… (Enter để ghi)"
          className="absolute z-10 w-56 max-w-[60%] resize rounded-lg border-2 border-rose-400 bg-white/95 px-2 py-1 text-sm font-semibold text-rose-700 shadow-lg outline-none"
          style={{ left: `${pendingText.x * 100}%`, top: `${pendingText.y * 100}%` }}
        />
      )}
      <figcaption className="absolute -top-6 left-0 text-xs font-semibold text-gray-500">{page.label}</figcaption>
    </figure>
  );
});

export default function EssayAnnotator({
  pages,
  annotations,
  onChange,
  tool = "hand",
  color = "#e11d48",
  stamp = "check",
  penOnly = false,
  readOnly = false,
  onStampPlaced,
}: {
  pages: EssayPage[];
  annotations: EssayAnnotations;
  onChange?: (next: EssayAnnotations) => void;
  tool?: AnnotationTool;
  color?: string;
  stamp?: EssayStampKind;
  penOnly?: boolean;
  readOnly?: boolean;
  onStampPlaced?: (stamp: EssayStampKind) => void;
}) {
  // Giữ bản mới nhất trong ref để callback ổn định, trang không vẽ lại khi trang khác đổi.
  const latest = useRef({ annotations, onChange, onStampPlaced });
  useEffect(() => { latest.current = { annotations, onChange, onStampPlaced }; });
  const [handlers] = useState(() => ({
    add: (key: string, mark: EssayMark) => {
      const { annotations: current, onChange: change, onStampPlaced: stamped } = latest.current;
      change?.({ ...current, [key]: [...(current[key] ?? []), mark] });
      if (mark.kind === "stamp") stamped?.(mark.stamp);
    },
    remove: (key: string, id: string) => {
      const { annotations: current, onChange: change } = latest.current;
      change?.({ ...current, [key]: (current[key] ?? []).filter((mark) => mark.id !== id) });
    },
  }));

  return (
    <div className="space-y-10 pt-6">
      {pages.map((page) => (
        <AnnotatedPage
          key={page.key}
          page={page}
          marks={annotations[page.key] ?? []}
          tool={tool}
          color={color}
          stamp={stamp}
          penOnly={penOnly}
          readOnly={readOnly}
          onAdd={handlers.add}
          onRemove={handlers.remove}
        />
      ))}
    </div>
  );
}
