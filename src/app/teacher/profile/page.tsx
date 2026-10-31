import { redirect } from "next/navigation";

// Hồ sơ giáo viên đã gộp vào trang Tài khoản chung.
export default function TeacherProfilePage() {
  redirect("/tai-khoan");
}
