import AdminGuard from "@/components/AdminGuard";
import UploadExam from "@/components/UploadExam";

export default function UploadPage() {
  return (
    <AdminGuard>
      <div className="flex-1 flex flex-col bg-gray-50/50">
        <UploadExam />
      </div>
    </AdminGuard>
  );
}
