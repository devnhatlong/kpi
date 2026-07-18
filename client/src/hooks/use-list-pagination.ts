"use client";

import { useEffect, useState } from "react";

import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

export function useListPagination(initialLimit = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(initialLimit);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const changeLimit = (next: number) => {
    setLimit(next);
    setPage(1);
  };

  return {
    page,
    setPage,
    limit,
    setLimit: changeLimit,
    query,
    setQuery,
    debouncedQuery,
  };
}
