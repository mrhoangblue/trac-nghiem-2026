# Hướng dẫn kết nối Cloudflare R2 cho website trắc nghiệm

Cập nhật ngày 27/09/2026, múi giờ Asia/Ho_Chi_Minh.

## 1. Trạng thái hiện tại

Cloudflare R2 đã được kết nối và kiểm thử thành công trên máy local.

| Hạng mục | Giá trị / trạng thái |
| --- | --- |
| Cloudflare account | `Frankii` |
| Account ID | `d167c941879591d5f7226fddde596507` |
| Bucket dùng cho website | `lms` |
| Vị trí bucket | Asia-Pacific (APAC) |
| Storage class | Standard |
| S3 endpoint | `https://d167c941879591d5f7226fddde596507.r2.cloudflarestorage.com` |
| Public development URL | `https://pub-8570ef336c1a44e9a59d382b24202de6.r2.dev` |
| Token | `website-trac-nghiem-lms` |
| Quyền token | Object Read & Write |
| Phạm vi token | Chỉ bucket `lms` |
| CORS local | Đã cho phép `http://localhost:3000` |
| Kiểm thử upload | Thành công |
| Kiểm thử đọc public | HTTP 200 |

Tệp kiểm thử:

`https://pub-8570ef336c1a44e9a59d382b24202de6.r2.dev/healthchecks/connection-2026-09-27.txt`

Bucket `edtech-math` đã tồn tại từ trước và chứa tài liệu khác. Website này dùng bucket `lms`; không sửa hoặc trộn dữ liệu với `edtech-math`.

## 2. Thông tin đã điền vào dự án

Các biến sau đã được điền vào `.env.local`:

```env
R2_ACCOUNT_ID="d167c941879591d5f7226fddde596507"
R2_ACCESS_KEY_ID="<đã điền trong .env.local>"
R2_SECRET_ACCESS_KEY="<đã điền trong .env.local>"
R2_BUCKET_NAME="lms"
R2_PUBLIC_BASE_URL="https://pub-8570ef336c1a44e9a59d382b24202de6.r2.dev"
R2_ENDPOINT="https://d167c941879591d5f7226fddde596507.r2.cloudflarestorage.com"
```

`.env.local` đã nằm trong `.gitignore`. Không đổi tên các biến thành `NEXT_PUBLIC_*`: access key và secret chỉ được dùng ở máy chủ để tạo URL upload ký tạm thời.

Việc “public” chỉ áp dụng cho URL đọc file trong bucket. `R2_SECRET_ACCESS_KEY` không được công khai vì khóa này cho phép ghi và xóa dữ liệu. Account ID, bucket name, endpoint và public URL có thể công khai.

## 3. Cấu hình trên Cloudflare

### 3.1 Public Development URL

Trong **Cloudflare Dashboard → Storage & databases → R2 → lms → Settings**, mục **Public Development URL** đã được bật:

```text
https://pub-8570ef336c1a44e9a59d382b24202de6.r2.dev
```

`r2.dev` phù hợp để kiểm thử. Cloudflare áp dụng giới hạn lưu lượng cho URL này; khi vận hành chính thức nên dùng custom domain, ví dụ `https://files.tenmien.vn`.

### 3.2 CORS

Trong **lms → Settings → CORS Policy**, cấu hình hiện tại là:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Khi có domain chính thức, thêm domain vào `AllowedOrigins` và giữ localhost nếu vẫn phát triển trên máy:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://ten-mien-chinh-thuc.vn"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Origin không có dấu `/` ở cuối. `Content-Type` gửi từ trình duyệt phải trùng với `Content-Type` dùng khi ký URL.

### 3.3 API token

Token `website-trac-nghiem-lms` được tạo tại **R2 Overview → Manage API Tokens → Create Account API token** với cấu hình:

1. Permission: **Object Read & Write**.
2. Scope: **Apply to specific buckets only**.
3. Bucket: **lms**.
4. TTL: không giới hạn.
5. IP filtering: chưa giới hạn vì chưa có IP máy chủ cố định.

Không dùng quyền **Admin Read & Write** vì website không cần tạo hoặc xóa bucket.

## 4. Kiến trúc upload của website

Trình duyệt không nhận secret R2. Luồng upload:

1. Giáo viên chọn file.
2. Trình duyệt gọi `POST /api/storage/presign` kèm Firebase ID token.
3. Máy chủ kiểm tra vai trò `admin` hoặc `mod`.
4. Máy chủ dùng secret R2 để tạo presigned `PUT` URL có hiệu lực 10 phút.
5. Trình duyệt upload trực tiếp file lên R2.
6. Website lưu object key, public URL và metadata vào Firestore.
7. File nhị phân nằm trong R2, không nằm trong Firestore.

Mã chính:

- `src/lib/r2Storage.ts`: S3 client, object key, presigned URL, upload/download phía máy chủ.
- `src/app/api/storage/presign/route.ts`: xác thực giáo viên, kiểm tra loại và dung lượng file.
- `src/app/api/storage/r2/status/route.ts`: trạng thái cấu hình cho admin/mod.
- `src/app/admin/create-exam/page.tsx`: upload file đề và ảnh minh họa.
- `src/components/classroom/ClassLearningContent.tsx`: upload học liệu lớp học.

## 5. Cấu trúc object trong bucket

```text
lms/
├── exam-imports/YYYY-MM-DD/<uuid>-ten-file.docx
├── exam-imports/YYYY-MM-DD/<uuid>-ten-file.pdf
├── exam-imports/YYYY-MM-DD/<uuid>-ten-file.tex
├── exam-assets/YYYY-MM-DD/<uuid>-anh-minh-hoa.png
├── learning-materials/YYYY-MM-DD/<uuid>-hoc-lieu.pdf
└── healthchecks/connection-2026-09-27.txt
```

Tên file được bỏ dấu tiếng Việt và ký tự không an toàn; UUID ngăn trùng tên.

## 6. Định dạng và giới hạn

| Nhóm | Định dạng | Dung lượng tối đa |
| --- | --- | ---: |
| File nhập đề | DOCX, PDF, TEX | 25 MB |
| Ảnh minh họa đề | PNG, JPG, JPEG, WebP, SVG | 8 MB |
| Học liệu | PDF, DOCX, PPTX, MP4, WebM, PNG, JPG, JPEG, WebP, SVG | 100 MB |

Các giới hạn được kiểm tra trước khi cấp presigned URL. URL upload hết hạn sau 10 phút.

## 7. Kiểm tra trong website

### Kiểm tra trạng thái

1. Chạy `npm run dev`.
2. Đăng nhập bằng tài khoản `admin` hoặc `mod`.
3. Gọi `GET /api/storage/r2/status` với Firebase token.
4. Kết quả đúng:

```json
{
  "configured": true,
  "publicAccessConfigured": true,
  "missing": [],
  "bucket": "lms"
}
```

### Kiểm tra học liệu

1. Mở **Quản lý lớp học**.
2. Chọn một lớp và khóa học.
3. Thêm bài học hoặc học liệu.
4. Chọn **Upload file trực tiếp lên R2**.
5. Upload PDF hoặc ảnh nhỏ.
6. Mở URL được lưu và kiểm tra file hiển thị.

### Kiểm tra file đề

1. Mở **Tạo bài thi mới**.
2. Chọn DOCX, PDF hoặc TEX.
3. `POST /api/storage/presign` phải trả HTTP 200.
4. Yêu cầu `PUT` đến `r2.cloudflarestorage.com` phải trả HTTP 200.
5. Trong R2 → `lms` → Objects, kiểm tra file tại `exam-imports/`.

## 8. Triển khai production

Trên Vercel hoặc máy chủ production, khai báo sáu biến `R2_*` giống `.env.local`. Sau đó:

1. Thêm domain website vào CORS.
2. Kết nối custom domain tại **lms → Settings → Custom Domains**.
3. Đổi `R2_PUBLIC_BASE_URL` sang custom domain.
4. Redeploy để biến môi trường có hiệu lực.
5. Upload và mở lại một file thử nghiệm.
6. Khi custom domain ổn định, có thể tắt `r2.dev` để tránh đường truy cập công khai thứ hai.

## 9. Xử lý lỗi

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
| --- | --- | --- |
| `R2_NOT_READY` | Thiếu biến môi trường hoặc public URL | Kiểm tra sáu biến `R2_*`, khởi động lại server |
| HTTP 401 từ `/api/storage/presign` | Chưa đăng nhập hoặc không phải admin/mod | Đăng nhập lại và kiểm tra role Firestore |
| HTTP 403 từ R2 | Sai key, secret, bucket hoặc endpoint | Đối chiếu `.env.local`; tạo token mới nếu mất secret |
| Lỗi CORS | Origin/header chưa được cho phép | Thêm origin, `PUT`, `HEAD`, `Content-Type`; chờ khoảng 30 giây |
| `SignatureDoesNotMatch` | `Content-Type` upload khác lúc ký | Giữ nguyên header do API `/presign` trả về |
| Upload được nhưng URL 404/403 | Sai public URL hoặc chưa bật public access | Kiểm tra URL `r2.dev`/custom domain và object key |
| Local vẫn báo chưa cấu hình | Next.js chưa đọc lại `.env.local` | Dừng và chạy lại `npm run dev` |

## 10. Luân chuyển khóa

1. Tạo token mới với quyền Object Read & Write chỉ cho `lms`.
2. Cập nhật access key và secret ở local và production.
3. Khởi động lại hoặc redeploy.
4. Upload file thử nghiệm.
5. Chỉ sau khi kiểm thử thành công mới thu hồi token cũ.

Nếu secret từng bị đưa lên Git, phải thu hồi token ngay; xóa secret khỏi commit không làm secret cũ an toàn trở lại.

## 11. Tài liệu chính thức

- [Bắt đầu với R2 và S3 API](https://developers.cloudflare.com/r2/get-started/s3/)
- [AWS SDK for JavaScript v3 với R2](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/)
- [Public bucket và custom domain](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [Giới hạn URL r2.dev](https://developers.cloudflare.com/r2/platform/limits/)
- [Tạo bucket R2](https://developers.cloudflare.com/r2/buckets/create-buckets/)

## 12. Phạm vi public

Cấu hình hiện tại cho phép mọi người có URL đọc file. Phù hợp với ảnh trong đề, file đề công khai, học liệu miễn phí và hình minh họa khóa học.

Nếu cần bảo vệ học liệu trả phí hoặc tài liệu chỉ dành cho một lớp, giữ bucket/private path không public và cấp presigned GET URL có thời hạn sau khi máy chủ kiểm tra thành viên lớp.
