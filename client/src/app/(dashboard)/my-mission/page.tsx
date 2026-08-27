import { redirect } from "next/navigation";

/** Đổi tên theo đặc tả → nhiệm vụ cá nhân. */
export default function MyMissionRedirectPage() {
  redirect("/mission/personal");
}
