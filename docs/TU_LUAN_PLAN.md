# Cấu trúc đề nhiều phần và chấm tự luận trực tiếp

Nghiên cứu 31/10/2026; đã triển khai giai đoạn 1–3 và phần xem bài đã chấm của giai đoạn 4 (xem mục 7).

## 1. Bốn cấu trúc đề

| Cấu trúc | Phần | Chấm |
|---|---|---|
| Chỉ trắc nghiệm | I | Tự động |
| Trắc nghiệm + Đúng/Sai | I, II | Tự động |
| 3 phần (mẫu TN THPT 2025) | I, II, III | Tự động |
| 4 phần | I, II, III, IV Tự luận | I–III tự động, IV giáo viên chấm |

- Giáo viên chọn cấu trúc ở thẻ "Nội dung đề". Cấu trúc quyết định: phần nào được phép có câu, ô điểm nào hiện, tổng điểm tối đa.
- Smart Input đã tách được 4 loại: `\choice` → I, `\choiceTF` → II, `\shortans`/`\dapso` → III, khối `ex` không có lệnh đáp án → `essay` (hiện đang bị báo là "chưa xác định"). Với cấu trúc 4 phần, `essay` trở thành Phần IV.
- Kiểm tra chéo: nếu chọn "Chỉ trắc nghiệm" mà dán vào có câu Đúng/Sai thì báo ngay, không âm thầm bỏ câu.
- Điểm Phần IV: tổng điểm phần đặt ở "Thiết lập làm bài"; điểm từng câu mặc định chia đều, ghi đè được bằng `\diem{1,5}` trong khối `ex`. `\loigiai` của câu tự luận là hướng dẫn chấm, chỉ giáo viên thấy khi chấm.

## 2. Học sinh nộp bài tự luận

- Phần IV hiện đề như các phần khác, kèm khung "Nộp bài làm tự luận": chụp ảnh (mở camera trên điện thoại) hoặc chọn ảnh/PDF, xem trước, đổi thứ tự trang, xóa trang.
- Ảnh được xoay đúng chiều, thu về cạnh dài 2000px, JPEG/WebP ~0,8 ngay trên máy trước khi tải: ảnh điện thoại 4–8 MB còn khoảng 300–500 KB, mạng yếu vẫn nộp được.
- Tải thẳng lên R2 bằng presigned URL (giống mục Bài tập lớp: `/api/classes/[classId]/activity/upload`), thư mục riêng tư `essay-submissions/`. Không qua máy chủ Vercel nên không vướng giới hạn 4,5 MB.
- Thời gian nộp ảnh: học sinh viết trên giấy nên cần thời gian chụp sau khi hết giờ. Đề xuất "thời gian bổ sung để nộp ảnh" (mặc định 10 phút) sau khi nộp phần trắc nghiệm.
- Bài làm lưu nháp trên máy (như đáp án trắc nghiệm hiện nay), mất mạng giữa chừng không mất ảnh đã chụp.

## 3. Giáo viên chấm ngay trên bài

Màn hình chấm `/teacher/grade/[submissionId]`, không cần tải file về:

- **Bên trái, bài làm:** các trang nối tiếp nhau. Ảnh hiển thị trực tiếp; PDF hiển thị bằng pdf.js đang dùng ở `PdfViewer`. Có phóng to/thu nhỏ, xoay trang.
- **Lớp chấm phủ lên trang (SVG):**
  - Bút đỏ; nét mượt, có lực nhấn với Apple Pencil/bút cảm ứng, dùng Pointer Events. Trên iPad, ngón tay cuộn trang, chỉ bút mới vẽ.
  - Bút dạ quang, ô chữ nhận xét, dấu nhanh ✓ / ✗ / "+0,25" / "+0,5".
  - Tẩy, hoàn tác/làm lại.
  - Tọa độ lưu theo tỉ lệ 0–1 của trang nên phóng to hay thu nhỏ vẫn đúng chỗ. Không sửa file gốc của học sinh.
- **Bên phải, phiếu chấm:**
  - Từng câu Phần IV: điểm tối đa, ô điểm bước 0,25, nhận xét ngắn, hướng dẫn chấm (`\loigiai`).
  - Bấm dấu "+0,5" trên bài sẽ tự cộng vào ô điểm của câu đang chọn.
  - Điểm Phần I–III đã chấm tự động và tổng điểm cập nhật ngay.
- **Hàng chờ chấm:** "Lưu và chấm bài tiếp" mở bài chưa chấm kế tiếp của cùng đề; danh sách bài theo trạng thái Chờ chấm / Đã chấm. Có phím tắt cho người chấm nhiều.
- **Học sinh xem bài đã chấm:** trang kết quả hiện ảnh bài làm cùng nét chấm của giáo viên (chỉ xem), điểm và nhận xét từng câu. Trước khi chấm xong hiện "Điểm tạm tính Phần I–III · Phần IV chờ chấm".
- Giai đoạn sau: xuất PDF bài đã chấm (pdf-lib, chạy trên trình duyệt) để in hoặc gửi phụ huynh.

## 4. Dữ liệu

- `exams/{id}`:
  - `structure: "p1" | "p12" | "p123" | "p1234"`
  - `scoringConfig.part4TotalScore`
  - câu `essay` có thêm `points`
  - `essayUploadGraceMinutes`
- `submissions/{id}`:
  - `essay.files[]`, mỗi file gồm `key`, `contentType`, `pageCount`, `width`, `height`; kèm `essay.uploadedAt`
  - `grading`: `status` ("pending" | "graded"), `essayScores`, `essayComments`, `gradedBy`, `gradedAt`
  - `scores.p4`
- `essay_annotations/{submissionId}`: nét chấm theo từng trang, lưu riêng để tài liệu bài nộp không phình to; giới hạn 1 MB/tài liệu.
- File trên R2 để riêng tư. Trình duyệt chỉ nhận link ký tạm thời, 10 phút (`createR2DownloadUrl`), sau khi API kiểm tra đúng học sinh chủ bài hoặc giáo viên của đề.
- Những chỗ phải cộng thêm `p4`:
  - bảng xếp hạng (`submissionScore`)
  - lịch sử làm bài
  - email kết quả
  - thống kê
  - Bài "chờ chấm" không tính vào trung bình cho tới khi chấm xong.

## 5. Lộ trình

1. Cấu trúc đề và Phần IV:
   - chọn cấu trúc, điểm Phần IV
   - parser nhận `essay` và `\diem`
   - hiện Phần IV khi làm bài và trong bản xem trước
2. Nộp bài tự luận: chụp/chọn ảnh, nén, sắp trang, tải R2, thời gian bổ sung, lưu nháp.
3. Màn hình chấm: hiển thị trang, lớp chấm SVG, phiếu điểm, hàng chờ.
4. Học sinh xem bài đã chấm, tổng điểm cuối, email "Bài đã được chấm"; sau đó là xuất PDF.

## 6. Đã chốt

1. Điểm Phần IV: tổng phần, chia đều, `\diem{}` ghi đè.
2. Sau khi nộp có thêm 5 phút (`ESSAY_UPLOAD_GRACE_MINUTES`) để nộp ảnh; Phần I–III khóa.
3. Một khung nộp chung cho cả Phần IV.
4. Học sinh chờ chấm xong mới thấy điểm và bài chữa.

## 7. Đã làm

- `src/utils/examStructure.ts`: cấu trúc, chia điểm, xếp câu theo phần, kiểm tra lệch cấu trúc.
- Tạo/sửa đề: chọn cấu trúc, ô điểm Phần IV, xem trước có điểm từng câu; API `upload-quiz` và `exams/[id]` PATCH lưu `structure`, `part4Count`, `scoringConfig.part4TotalScore`, `rawLatex.part4`.
- `api/exams/[id]/access`: bỏ `\loigiai` câu tự luận và `rawLatex` khi gửi cho học sinh.
- Nộp bài: `api/submissions` đặt `gradingStatus: "pending"`, `essay.uploadDeadline`, không trả điểm; `api/submissions/[id]/essay` (presign R2 `essay-submissions/`, attach, remove, reorder, finalize, GET link ký tạm thời).
- Làm bài: `EssayUploadPanel` (chụp/chọn, nén 2000px, sắp trang), `EssayUploadStage` (đếm ngược 5 phút, Hoàn tất, màn chờ chấm).
- Chấm: `/admin/grade/[examId]`, `EssayAnnotator` (bút perfect-freehand, dạ quang, chữ, dấu, tẩy, hoàn tác, phóng to, chế độ chỉ bút), `api/submissions/[id]/grade` (lưu nháp/hoàn tất, `essay_annotations/{id}`).
- Điểm: bài chờ chấm không tính ở bảng xếp hạng, lớp, lịch sử; trang kết quả đề có nút "Chấm tự luận"; học sinh xem bài đã chấm kèm nét chữa.

Còn lại: email "Bài đã được chấm", xuất PDF bài đã chấm, xoay trang khi chấm, luật Firestore chặn học sinh đọc trực tiếp `exams/{id}` (hiện học sinh vẫn có thể đọc hướng dẫn chấm nếu tự gọi Firestore).
