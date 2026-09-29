# Kiến trúc lưu trữ Firestore và Cloudflare R2

## Phân vai dữ liệu

- **Firestore** lưu dữ liệu cần truy vấn nhanh: thông tin đề thi, cấu hình, câu hỏi đã phân tích, đáp án, lớp học, khóa học, bài học, tiến độ và tham chiếu tới tệp.
- **Cloudflare R2** lưu tệp dung lượng lớn: PDF, DOCX, PPTX, ảnh, hình TikZ/SVG và nguồn LaTeX đầy đủ.
- Video chỉ dùng liên kết nhúng từ YouTube, Vimeo hoặc Google Drive; hệ thống không tải video lên R2.

## Nguồn LaTeX của đề thi

Nguồn LaTeX đầy đủ không còn được ghi trực tiếp vào tài liệu `exams` mới. Máy chủ:

1. Chuẩn hóa ba phần LaTeX.
2. Mã hóa nguồn bằng AES-256-GCM.
3. Lưu bản mã hóa trong tiền tố `exam-sources/` trên R2.
4. Chỉ lưu `key`, kích thước, SHA-256, phiên bản và thời điểm cập nhật trong Firestore.
5. Giải mã nguồn qua API đã xác thực khi giáo viên mở trang sửa đề.

Khóa mã hóa được lấy theo thứ tự `EXAM_SOURCE_ENCRYPTION_KEY`, `R2_SECRET_ACCESS_KEY`, rồi `FIREBASE_PRIVATE_KEY`. Khi hệ thống đang có dữ liệu trong `exam-sources/`, không thay đồng thời các khóa này nếu chưa có kế hoạch mã hóa lại dữ liệu. Nên cấu hình một `EXAM_SOURCE_ENCRYPTION_KEY` ổn định trên mọi môi trường trong giai đoạn vận hành tiếp theo.

## Giới hạn an toàn

- Mảng câu hỏi được giữ trong Firestore để trang làm bài tải nhanh.
- API từ chối phần câu hỏi lớn hơn 850 KiB để chừa dung lượng cho metadata và tránh vượt giới hạn 1 MiB của một tài liệu Firestore.
- Nguồn LaTeX mã hóa trên R2 hiện giới hạn 4 MiB cho mỗi đề.
- Các trường lớn không cần truy vấn (`questions`, `rawLatex`, `answersJson`, `activityLog`, `questionTimings`) được miễn lập chỉ mục để giảm dung lượng index.

## Di chuyển dữ liệu cũ

Kiểm tra mà không thay đổi dữ liệu:

```bash
npm run migrate:exam-sources
```

Di chuyển sau khi phiên bản ứng dụng tương thích đã được triển khai:

```bash
npm run migrate:exam-sources -- --apply
```

Script chỉ xóa `rawLatex` khỏi Firestore sau khi đã tải lại đối tượng trên R2, giải mã và xác nhận SHA-256. Các đề chưa có mảng câu hỏi đã phân tích sẽ được giữ nguyên để tránh làm mất dữ liệu cần thiết cho trang làm bài.
