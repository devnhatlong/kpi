"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Vệt nền trượt theo mục đang chọn trong một nhóm tab.
 *
 * Đo bằng DOM rồi ghi thẳng style vào vệt, KHÔNG qua state: một lần đổi tab mà
 * kéo theo re-render cả bảng dữ liệu bên dưới thì animation giật.
 *
 * Mục đang chọn nhận diện qua `data-state="active"` (tab của Radix) hoặc
 * `data-active="true"` (nhóm nút tự dựng), nên hook không cần biết giá trị đang
 * chọn là gì - ai đổi kiểu nào cũng chạy.
 */
export function useSlidingIndicator<T extends HTMLElement = HTMLDivElement>() {
  const listRef = useRef<T | null>(null);
  const indicatorRef = useRef<HTMLSpanElement | null>(null);

  const move = useCallback(() => {
    const list = listRef.current;
    const bar = indicatorRef.current;
    if (!list || !bar) return;

    const active = list.querySelector<HTMLElement>(
      '[data-state="active"], [data-active="true"]',
    );
    if (!active) {
      bar.style.opacity = "0";
      return;
    }

    // Lần đầu thì đặt vệt vào chỗ luôn, không cho nó bay từ góc trái ra.
    const firstPaint = bar.style.opacity !== "1";
    if (firstPaint) bar.style.transitionDuration = "0ms";

    bar.style.opacity = "1";
    bar.style.width = `${active.offsetWidth}px`;
    bar.style.height = `${active.offsetHeight}px`;
    bar.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;

    if (firstPaint) {
      // Trả lại thời lượng ở khung hình sau, không thì lần đổi tab kế tiếp cũng
      // bị mất animation.
      requestAnimationFrame(() => {
        bar.style.transitionDuration = "";
      });
    }
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    move();

    // Đổi tab (data-state / data-active) và đổi bề ngang (số đếm trên nhãn dài
    // ra, cửa sổ co lại) đều phải đo lại.
    const mutations = new MutationObserver(move);
    mutations.observe(list, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "data-active"],
    });

    const resizes = new ResizeObserver(move);
    resizes.observe(list);
    for (const child of Array.from(list.children)) resizes.observe(child);

    return () => {
      mutations.disconnect();
      resizes.disconnect();
    };
  }, [move]);

  return { listRef, indicatorRef, syncIndicator: move };
}

/** Lớp nền của vệt trượt - dùng chung để mọi nhóm tab trượt giống nhau. */
export const SLIDING_INDICATOR_CLASS =
  "pointer-events-none absolute left-0 top-0 rounded-md bg-background opacity-0 shadow-sm transition-[transform,width,height] duration-200 ease-out motion-reduce:transition-none";
