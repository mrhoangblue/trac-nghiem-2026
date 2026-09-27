# Pipeline Word OLE và rà soát lời giải LaTeX

Ngày thực hiện: 27/09/2026

## 1. Pipeline nhập Word mới

DOCX được xử lý theo pipeline riêng, không đi qua giả định “mọi công thức phải là LaTeX”:

1. Đọc `word/document.xml` và relationships để giữ đúng thứ tự đoạn văn, bảng, hình và đối tượng OLE.
2. Tách nội dung trước các tiêu đề `ĐÁP ÁN`, `GIẢI CHI TIẾT` hoặc `LỜI GIẢI CHI TIẾT` làm phần đề.
3. Tách 22 câu theo marker `Câu n`; phân loại câu nhiều lựa chọn, đúng/sai và trả lời ngắn theo cấu trúc nội dung.
4. Với BlueMath, giải mã metadata `BlueMathLatex:` thành LaTeX.
5. Với MathType OLE, lấy ảnh xem trước WMF/EMF từ `v:imagedata`, chuyển thành PNG bằng bộ chuyển đổi chạy trong Node.js và chèn token ảnh đúng vị trí trong câu, lựa chọn hoặc lời giải.
6. Hình minh họa Word thông thường được upload như tài nguyên câu hỏi; ảnh công thức không bị đẩy xuống cuối câu.
7. Đọc đáp án A–D, đúng/sai từ bảng đáp án hoặc đánh dấu màu trong lời giải. Đáp án ngắn chỉ tồn tại dưới dạng MathType được giữ thành ảnh và gắn cờ `requiresAnswerReview` vì chấm tự động vẫn cần một giá trị chữ/số.
8. Trên localhost khi chưa có R2, tài nguyên được ghi vào `public/local-imports/<batch-id>` để kiểm thử giao diện. Production chỉ sử dụng R2; thư mục local đã được loại khỏi Git.

## 2. Kết quả mẫu MathType

- Tách đúng 22 câu: 12 nhiều lựa chọn, 4 đúng/sai, 6 trả lời ngắn.
- Phát hiện 499 đối tượng MathType/OLE và giữ toàn bộ dưới dạng ảnh inline.
- Chuyển 285 file WMF/EMF duy nhất sang PNG; các đối tượng trùng dùng lại cùng URL.
- Upload cục bộ tổng cộng 297 tài nguyên thực dùng, gồm 296 PNG và 1 TIFF, khoảng 1,9 MB.
- Đọc đúng 12 đáp án nhiều lựa chọn và 4 bộ đáp án đúng/sai.
- Giữ cả 6 đáp án ngắn dưới dạng ảnh; các ảnh này cần được giáo viên nhập thêm giá trị tương đương để chấm tự động.
- Thời gian phân tích, chuyển ảnh và ghi local của file mẫu khoảng 1,1 giây trên máy kiểm thử.

## 3. Rà soát các đề LaTeX đã lưu

Kiểm tra read-only collection `exams`, không sửa dữ liệu Firestore:

| Chỉ số | Kết quả |
| --- | ---: |
| Đề có `rawLatex` | 5 |
| Tổng số câu | 110 |
| Câu có lời giải | 110 |
| Biểu thức toán kiểm tra bằng KaTeX | 1.194 |
| Lỗi parse KaTeX làm hỏng biểu thức | 0 |
| Lời giải render thử bị exception | 0 |

Các lỗi hiển thị tìm thấy nằm ngoài lõi công thức:

- `[NEWS] Đề thi Sở HT 2026`: 5 khối `itemize`, 14 lệnh `item` hiện từng bị hiển thị như mã nguồn.
- `ĐỀ THI THỬ SỞ THÁI NGUYÊN - LẦN 2`: 2 lệnh `textbf` nằm ngoài math.
- `ĐỀ THI THỬ TN THPT - SỞ THANH HÓA LẦN 2 - 2026`: 1 khối `itemize`, 3 lệnh `item`, 3 lệnh `textbf`.
- Hai đề còn lại không có lệnh văn bản ngoài math mà renderer cũ bỏ sót.
- Có 11 biểu thức chứa chữ tiếng Việt trong vùng toán. KaTeX phát cảnh báo font Unicode nhưng không phát sinh lỗi parse; cần kiểm tra thị giác khi bổ sung font hoặc đổi engine toán sau này.
- Renderer cũ dùng `dangerouslySetInnerHTML` chỉ để đổi `\\` thành xuống dòng. Dấu `<`/`>` trong nội dung có thể bị trình duyệt hiểu nhầm là HTML và làm mất chữ.

## 4. Sửa lỗi hiển thị đã thực hiện

- Bỏ HTML thô trong văn bản lời giải; xuống dòng được dựng bằng React node nên dấu so sánh và nội dung người dùng không bị diễn giải thành thẻ HTML.
- Nhận `itemize`, `enumerate`, `item`, `textbf`, `textit` và `emph` ở lớp văn bản.
- Chuẩn hóa delimiter `\\(...\\)` và `\\[...\\]` sang định dạng KaTeX hiện dùng.
- Render ảnh MathType inline trong thân câu, phương án và lời giải.
- Admin preview, trang sửa đề, phòng thi và trang xem lại dùng cùng một bộ xử lý nội dung thay vì render phương án bằng một pipeline khác.
- Render thử toàn bộ 110 lời giải bằng pipeline mới: không có exception.

## 5. Hướng hoàn thiện lâu dài

1. Giữ một mô hình nội dung trung gian gồm các node `text`, `math`, `image`, `list`, `table`, thay cho việc truyền chuỗi pha trộn giữa LaTeX, token ảnh và HTML.
2. Chạy bộ chẩn đoán lúc giáo viên xem trước: delimiter mất cặp, lệnh ngoài danh sách hỗ trợ, ảnh thiếu URL, đáp án ngắn chỉ có ảnh và lỗi KaTeX.
3. Không lưu đề nếu còn lỗi nghiêm trọng; cho phép lưu với cảnh báo đối với font Unicode hoặc đáp án cần giáo viên nhập lại.
4. Thực hiện migration nền cho 5 đề hiện có để lưu phiên bản nội dung đã chuẩn hóa. Chưa chạy migration trong phiên này vì rà soát được thực hiện read-only.
5. Khi R2 được cấu hình, upload theo lô có giới hạn đồng thời và dùng hash để tái sử dụng ảnh công thức trùng, giảm số object và thời gian nhập.
