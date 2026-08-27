import { redirect } from "next/navigation";

/** Giữ link cũ → chuyển sang /mission/received */
export default function MissionPersonalInboxRedirectPage() {
  redirect("/mission/received");
}
