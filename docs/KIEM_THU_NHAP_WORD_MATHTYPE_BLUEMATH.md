# Kiểm thử nhập đề Word: MathType và BlueMath

Ngày kiểm thử: 27/09/2026  
Phạm vi: đọc và phân tích trực tiếp hai file DOCX mẫu; tài nguyên được ghi vào thư mục tạm trên máy, không gọi Cloudflare R2 và không ghi dữ liệu đề vào Firestore.

## Kết luận

| Mẫu | Kết quả | Mức sẵn sàng |
| --- | --- | --- |
| BlueMath SVG có metadata | Tách đúng 22 câu: 12 nhiều lựa chọn, 4 đúng/sai, 6 trả lời ngắn. Đọc được công thức LaTeX, đáp án, hình minh họa và phần lớn lời giải. | Có thể dùng để nhập và xem trước, sau đó giáo viên kiểm tra trước khi lưu. |
| MathType OLE/MTEF cũ | Tách đúng 22 câu, đọc được văn bản, hình minh họa, 12 đáp án nhiều lựa chọn, 4 bộ đáp án đúng/sai và lời giải. 499 công thức OLE được giữ thành ảnh inline; 6 đáp án ngắn được giữ thành ảnh và gắn cờ cần nhập giá trị chấm tự động. | Có thể nhập và xem trước theo pipeline ảnh; giáo viên cần hoàn thiện giá trị của đáp án ngắn trước khi phát hành. |

## Kết quả định lượng

### Đề 04 — MathType

- DOCX chứa 499 đối tượng nhúng MathType/OLE và không có Word Equation OMML.
- Bộ nhập nhận đúng 22 câu và đúng cơ cấu 12/4/6.
- Nhận đúng đáp án nhiều lựa chọn: `C, B, B, A, A, B, C, A, D, D, C, D`.
- Nhận đúng bốn bộ đáp án đúng/sai từ các bảng lời giải.
- Giữ 22 tham chiếu hình; chỉ ghi 13 file hình thực dùng vào thư mục tạm thay vì ghi toàn bộ 297 file media trong DOCX.
- 499 công thức OLE trong thân câu, lựa chọn và lời giải được lấy từ ảnh xem trước WMF/EMF, chuyển sang PNG và chèn đúng vị trí. Sáu đáp án ngắn được giữ thành ảnh nhưng vẫn cần giáo viên nhập giá trị chữ/số để chấm tự động.

### Đề 10 — BlueMath

- DOCX chứa 308 SVG BlueMath; metadata LaTeX nằm trong thuộc tính `BlueMathLatex:` mã hóa Base64 của đối tượng Word.
- Bộ nhập nhận đúng 22 câu và đúng cơ cấu 12/4/6.
- Đọc đủ 12 đáp án nhiều lựa chọn, 4 bộ đáp án đúng/sai và 6 đáp án trả lời ngắn: `0,43`, `0,83`, `116`, `760`, `2,72`, `3360`.
- Khôi phục 660 lần xuất hiện công thức từ toàn bộ phần đề và lời giải; 232 biểu thức được giữ trong 22 câu sau khi ghép lời giải.
- Giữ 28 tham chiếu hình và chỉ ghi 19 file hình thực dùng vào thư mục tạm, thay vì ghi toàn bộ 637 file media gồm cả SVG/PNG công thức trùng nhau.
- 21/22 câu có lời giải được tách tự động. Một câu không có khối lời giải rõ ràng trong cấu trúc văn bản nên cần kiểm tra thủ công.

## Thay đổi trong bộ nhập DOCX

- Tách phần đề khỏi bảng đáp án và lời giải để không tạo trùng 44 câu.
- Nhận lựa chọn A–D nằm cùng dòng hoặc được nối trực tiếp với công thức SVG.
- Nhận `Lời giải` có hoặc không có dấu hai chấm.
- Giải mã metadata BlueMath thành LaTeX và bỏ ảnh PNG/SVG công thức khỏi danh sách học liệu hình ảnh.
- Đọc bảng đáp án nhiều lựa chọn, đúng/sai và trả lời ngắn.
- Ghép lời giải với câu tương ứng; đọc đáp án được tô sáng khi tài liệu không có bảng đáp án chữ.
- Chỉ ghi các hình được tham chiếu thật sự; bỏ ảnh xem trước của công thức OLE và tài nguyên media không dùng.
- Gộp cảnh báo theo loại thay vì tạo hàng trăm cảnh báo WMF riêng lẻ.

## Dữ liệu kiểm thử cục bộ

- Kết quả Đề 04: `/tmp/exam-import-test/_E_04-SO_GD_HA_NO_I-_A_P_A_N/result.json`
- Kết quả Đề 10: `/tmp/exam-import-test/_E_10-SO_N_LA-_A_P_A_N_BlueMath/result.json`
- Các thư mục trên là dữ liệu tạm của máy và có thể bị hệ điều hành xóa. Không có file nào được tải lên R2.

## Hướng xử lý MathType

Ưu tiên quy trình chuyển hàng loạt công thức MathType sang Word Equation OMML hoặc BlueMath SVG có metadata trước khi upload. Nếu cần hỗ trợ trực tiếp MathType OLE, phải bổ sung bộ giải mã MTEF và kiểm thử trên nhiều phiên bản MathType; đây là hạng mục riêng vì định dạng nhúng cũ không ổn định giữa các bản Word.
