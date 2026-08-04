import type { Metadata } from "next";
import { AxesView } from "@/features/kpi-form-config/components/axes-view";

export const metadata: Metadata = {
  title: "Trục",
};

export default function AxesPage() {
  return <AxesView />;
}
