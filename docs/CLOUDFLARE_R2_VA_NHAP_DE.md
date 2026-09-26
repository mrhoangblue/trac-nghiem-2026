# Cloudflare R2 và nhập đề từ DOCX/PDF

Cập nhật ngày 26/09/2026, múi giờ Asia/Ho_Chi_Minh.

## 1. Trạng thái triển khai

Trước phiên này dự án chưa có mã kết nối Cloudflare R2, biến môi trường R2 hoặc API upload R2. Học liệu trong lớp chỉ lưu liên kết ngoài. Sau thay đổi này:

- giáo viên có thể tải học liệu trực tiếp từ trình duyệt lên R2 bằng URL ký tạm thời;
- file đề DOCX/PDF/TEX gốc được lưu ở thư mục `exam-imports/` trong bucket;
- ảnh PNG/JPG/WebP/SVG nằm trong DOCX được tách ra và lưu ở `exam-assets/`;
- Firestore lưu dữ liệu đề, câu hỏi, URL học liệu và khóa đối tượng R2; file nhị phân nằm trong R2, không nằm trực tiếp trong Firestore;
- nếu R2 chưa cấu hình, nhập đề vẫn có thể chạy bằng upload tạm qua máy chủ, nhưng file gốc và ảnh trong DOCX không được lưu bền vững.

## 2. Biến môi trường

Thêm vào `.env.local` khi chạy local và vào Environment Variables của nền tảng triển khai:

```env
R2_ACCOUNT_ID="..."
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
R2_BUCKET_NAME="..."
R2_PUBLIC_BASE_URL="https://static.ten-mien-cua-ban.vn"

# Không bắt buộc. Hệ thống tự tạo endpoint từ R2_ACCOUNT_ID.
# R2_ENDPOINT="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
```

Tạo Access Key có quyền đọc/ghi object cho đúng bucket. Không đưa secret vào biến có tiền tố `NEXT_PUBLIC_`, Git hoặc giao diện trình duyệt.

`R2_PUBLIC_BASE_URL` là custom domain của bucket. Có thể dùng URL `r2.dev` để thử nghiệm, nhưng nên dùng custom domain khi chạy thật. Ảnh đề và học liệu cần URL đọc được từ trình duyệt, vì vậy chỉ điền bốn thông số S3 là chưa đủ cho toàn bộ chức năng.

## 3. CORS cho upload trực tiếp

Trong R2 → Bucket → Settings → CORS Policy, thêm chính xác các origin đang dùng:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://ten-mien-cua-ban.vn"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Không thêm dấu `/` ở cuối origin. Sau khi sửa CORS có thể cần chờ khoảng 30 giây; nếu dùng custom domain đã cache, cần purge cache để nhận header mới.

## 4. Định dạng đề DOCX và TEX

Hệ thống nhận tiêu đề câu theo mẫu `Câu 1.`, `Câu 2.`. Mỗi câu nên có dòng `Đáp án:` và có thể có `Lời giải:`.

```text
Câu 1. Giá trị của biểu thức là
A. 1
B. 2
C. 3
D. 4
Đáp án: B
Lời giải: ...
```

Hỗ trợ hiện tại:

- Word Equation dạng OMML: phân số, căn, chỉ số trên/dưới, tổng, tích phân, giới hạn, dấu mũ, ma trận và một số cấu trúc phổ biến;
- ảnh raster và SVG nhúng trong DOCX, bao gồm SVG xuất bởi add-in nếu Word lưu nó trong `word/media`;
- trắc nghiệm A–D, đúng/sai a–d và câu trả lời ngắn.

MathType dạng OLE cũ trong `word/embeddings` không có biểu diễn toán học chuẩn để máy chủ đọc ổn định. Trình nhập sẽ cảnh báo; cần đổi công thức đó sang Word Equation hoặc SVG/PNG trước khi nhập. Luôn xem trước và sửa các câu được cảnh báo trước khi lưu.

Với file TEX, hệ thống tự lược bỏ `documentclass`, `usepackage`, phần đầu/cuối tài liệu, comment và nội dung ngoài câu hỏi. Chỉ các khối `\\begin{ex}…\\end{ex}` hoặc `\\begin{bt}…\\end{bt}` được đưa vào Smart Input. Câu được phân loại bằng `\\choice`, `\\choiceTF`, `\\shortans` hoặc `\\dapso`.

## 5. Định dạng đề PDF

PDF được đọc theo lớp văn bản và vị trí dòng. Cách này phù hợp với PDF tạo từ Word/LaTeX còn lớp text. PDF scan, công thức đã vẽ thành vector/ảnh, bố cục nhiều cột hoặc ký hiệu dùng font mã hóa riêng có thể mất cấu trúc.

Phiên bản hiện tại chủ động đưa cảnh báo và yêu cầu xem trước. Bước phát triển tiếp theo cho PDF scan là pipeline OCR tiếng Việt + nhận dạng công thức toán, kèm màn hình đối chiếu trang gốc và câu đã tách. Không nên tự động công bố đề OCR mà chưa có người duyệt.

## 6. Giới hạn và vận hành

- Đề DOCX/PDF/TEX tối đa 25 MB; ảnh minh họa đề tối đa 8 MB; học liệu tối đa 100 MB.
- URL upload ký tạm thời hết hạn sau 10 phút.
- Chỉ tài khoản vai trò `mod` hoặc `admin` được xin URL upload và nhập đề.
- Định dạng học liệu upload trực tiếp: PDF, DOCX, PPTX, MP4, WebM, PNG, JPG, WebP và SVG. Ảnh minh họa đề nhận PNG, JPG, WebP và SVG, được lưu trong `exam-assets/`.
- Nếu tài liệu chỉ dành cho học sinh trong lớp, cần phát triển bước tiếp theo: giữ bucket riêng tư và cấp URL đọc có thời hạn. Cấu hình public hiện tại phù hợp với tài nguyên không chứa dữ liệu nhạy cảm.
