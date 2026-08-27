"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { entityId, type Department } from "@/features/organization/types";
import { fetchMyWorkingDepartments, missionConfigKeys } from "./api";

const WORKING_UNIT_KEY = "mission-working-department-id";

export function useWorkingUnit() {
  const { data: scopedOptions = [] } = useSWR(
    [...missionConfigKeys.sheets, "my-departments"],
    fetchMyWorkingDepartments,
    { revalidateOnFocus: false },
  );

  const [workingDepartmentId, setWorkingDepartmentIdState] =
    useState<string>("");

  useEffect(() => {
    if (!scopedOptions.length) {
      setWorkingDepartmentIdState("");
      return;
    }
    const saved =
      typeof window !== "undefined"
        ? window.localStorage.getItem(WORKING_UNIT_KEY)
        : null;
    const validSaved =
      saved && scopedOptions.some((d) => entityId(d) === saved);
    const next = validSaved ? saved : entityId(scopedOptions[0]!);
    setWorkingDepartmentIdState(next);
  }, [scopedOptions]);

  function setWorkingDepartmentId(id: string) {
    setWorkingDepartmentIdState(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(WORKING_UNIT_KEY, id);
    }
  }

  const workingDepartment =
    scopedOptions.find((d) => entityId(d) === workingDepartmentId) ?? null;

  return {
    workingDepartmentId,
    workingDepartment,
    setWorkingDepartmentId,
    scopedOptions: scopedOptions as Department[],
  };
}
