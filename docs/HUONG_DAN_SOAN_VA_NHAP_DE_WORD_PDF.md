# Hướng dẫn soạn và nhập đề Word/PDF

## 1. Kết quả kiểm tra hai đề mẫu

### Đề 04 – MathType OLE

- 22 câu: 12 câu nhiều lựa chọn, 4 câu đúng/sai, 6 câu trả lời ngắn.
- 499 đối tượng MathType/OLE và 297 tệp ảnh; phần lớn ảnh xem trước là WMF.
- Word không cung cấp nội dung công thức dưới dạng văn bản. Hệ thống giữ công thức đúng vị trí bằng ảnh xem trước và chuyển WMF/EMF sang PNG hoặc SVG để trình duyệt hiển thị.
- Bảng đáp án ngắn cũng chứa công thức dạng ảnh. Hệ thống có thể giữ ảnh đáp án để giáo viên đối chiếu, nhưng giáo viên cần nhập thêm giá trị chữ/số nếu muốn chấm tự động.

### Đề 10 – BlueMath

- 22 câu: 12 câu nhiều lựa chọn, 4 câu đúng/sai, 6 câu trả lời ngắn.
- 308 SVG có metadata `BlueMathLatex`, cùng 324 PNG.
- Hệ thống đọc metadata để khôi phục LaTeX; các hình minh họa không phải công thức vẫn được lưu như ảnh.
- Cả 22 đáp án trong mẫu được nhận diện.

## 2. Mẫu cấu trúc Word nên dùng

Mỗi thành phần nên bắt đầu ở một đoạn riêng. Không đặt số câu và toàn bộ nội dung trong textbox.

```text
PHẦN I: ĐỀ BÀI

Câu 1. Nội dung câu hỏi...
A. Phương án A
B. Phương án B
C. Phương án C
D. Phương án D

Câu 13. Nội dung câu đúng/sai...
a) Mệnh đề a
b) Mệnh đề b
c) Mệnh đề c
d) Mệnh đề d

Câu 17. Nội dung câu trả lời ngắn...

PHẦN II: ĐÁP ÁN

... bảng đáp án ...

PHẦN III: GIẢI CHI TIẾT

Câu 1. Nội dung câu hỏi hoặc tiêu đề ngắn
Lời giải
Nội dung lời giải...
```

Các tiêu đề `ĐÁP ÁN`, `LỜI GIẢI CHI TIẾT` cũng được chấp nhận. Số câu phải có dạng `Câu 1.`, `Câu 2.`. Các lựa chọn phải bắt đầu bằng `A.`, `B.`, `C.`, `D.`; các mệnh đề đúng/sai bắt đầu bằng `a)`, `b)`, `c)`, `d)`.

## 3. Cách nhập công thức và hình

Thứ tự ưu tiên:

1. **BlueMath SVG có metadata**: giữ được LaTeX và hiển thị sắc nét.
2. **Word Equation (OMML)**: hệ thống chuyển các cấu trúc thông dụng sang LaTeX.
3. **MathType OLE**: được giữ bằng ảnh xem trước tại đúng vị trí; không nên kỳ vọng chuyển chính xác MTEF sang LaTeX.
4. **Ảnh công thức**: dùng PNG/SVG rõ nét; tránh ảnh chụp mờ.

Hình minh họa có thể là PNG, JPG, SVG, WMF hoặc EMF. Khi nhập DOCX, hệ thống tách hình và lưu vào R2; WMF/EMF được chuyển sang định dạng dùng được trên web.

## 4. DOCX hay PDF?

Nên dùng **DOCX làm nguồn chính**. DOCX giữ cấu trúc câu, đối tượng Word Equation, ảnh, OLE và metadata BlueMath.

PDF chỉ phù hợp làm đường nhập dự phòng:

- PDF có lớp chữ: hệ thống có thể tách câu, đáp án và lời giải.
- Công thức hoặc hình nằm dưới dạng vector/ảnh có thể không xuất hiện trong lớp chữ.
- PDF scan cần OCR trước khi nhập.
- Sau khi nhập PDF, luôn kiểm tra bản xem trước và đáp án trước khi lưu.

## 5. CORS cho upload trực tiếp lên R2

File lớn được trình duyệt tải thẳng lên R2 bằng URL ký sẵn. Bucket R2 cần cho phép các origin đang dùng:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "https://toanthayhoang.bluemath.app",
      "https://hoangblue-tn-2026.vercel.app"
    ],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["Content-Type", "x-amz-*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Thiết lập tại Cloudflare Dashboard → R2 → bucket → Settings → CORS policy. Token S3 hiện tại có quyền đọc/ghi object nhưng không có quyền đọc cấu hình CORS, vì vậy cấu hình này phải được đặt trong Dashboard hoặc bằng Cloudflare API token có quyền quản lý bucket.

Nếu upload trực tiếp bị CORS chặn, localhost và file nhỏ hơn 4 MB sẽ tự chuyển sang đường upload qua máy chủ. File lớn trên Vercel vẫn cần CORS đúng vì giới hạn kích thước request của nền tảng.

## 6. Quy trình kiểm tra sau khi nhập

1. Kiểm tra tổng số câu và số câu theo từng loại.
2. Mở ngẫu nhiên ít nhất 3 câu có công thức, 1 hình minh họa và 1 câu đúng/sai.
3. Kiểm tra toàn bộ 6 đáp án ngắn.
4. Với MathType OLE, nhập giá trị chữ/số cho đáp án đang được giữ bằng ảnh.
5. Chỉ lưu đề sau khi màn hình không còn cảnh báo đáp án chưa nhận diện.
