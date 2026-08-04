import { FormConfigTabs } from "@/features/kpi-form-config/components/form-config-tabs";

export default function FormConfigLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Cấu hình form KPI
        </h2>
        <p className="text-sm text-muted-foreground">
          Danh mục dùng cho form nhập KPI — Super Admin quản lý toàn tỉnh.
        </p>
      </div>
      <FormConfigTabs />
      {children}
    </div>
  );
}
