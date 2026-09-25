# Quy chuẩn giao diện website trắc nghiệm

Cập nhật: 24/09/2026. Tham chiếu thiết kế: mục 6 trong CLAUDE.md và bảng màu Tailwind của dự án Website Gia Su. Áp dụng sở thích màu Lộ Bàng Thổ đã được chủ dự án chốt, không phải tuyên bố về hiệu quả phong thủy.

## Bảng màu

| Vai trò | Màu |
| --- | --- |
| Nền chính | Ivory #FFFDF6 |
| Nền phụ / viền | Sand #F5F1E8 / #EDE7DA |
| Điểm nhấn thương hiệu | Amber #D97706 |
| Chữ / nút phụ | Earth #78350F, chữ đậm #451A03 |
| Nút chính | Sunset #EA580C, hover #C2410C, chữ trắng lớn/đậm |
| Thành công | Nâu/hổ phách và dấu kiểm; không xanh lá |
| Lỗi | Đỏ mận #9F1239; luôn kèm nội dung thông báo |

Tỷ lệ thị giác định hướng 60% nền kem/xám ấm, 30% nâu/hổ phách, 10% cam. Không sử dụng chữ cam nhạt cho nội dung nhỏ. Giữ nguyên màu của nội dung đề và hình do giáo viên nhập, không dùng CSS filter để đổi màu hình học.

## Thành phần

- Font Be Vietnam Pro cho tiếng Việt; font mono cho số/đồng hồ. Khắc phục biến font-sans trước đó tham chiếu font không được nạp.
- Thẻ bo góc 24–32px, viền ấm mảnh và shadow mềm; nút có trạng thái hover/focus rõ.
- Trang chủ: giới thiệu ngắn, minh họa toán dạng SVG nhẹ, bộ lọc khối lớp, tìm tên đề, thẻ đề và hướng dẫn ôn tập.
- Khách chưa đăng nhập thấy hướng dẫn đăng nhập thay vì gọi Firestore rồi báo lỗi quyền.
- Điều hướng chung, màn hình thi/review, học sinh, giáo viên và quản trị dùng chung token brand/success/danger.
- Trạng thái không chỉ phân biệt bằng màu: giữ nhãn, dấu kiểm và nội dung lỗi.
- Có skip link, focus-visible, reduced-motion; menu mobile đóng không nhận focus.

## Phạm vi và kiểm tra

- Giữ công thức chấm điểm và các thao tác nghiệp vụ của bản nguồn. Phần thiết kế không sửa Firestore rules hoặc API xác thực.
- Giữ bộ lọc đề theo lớp đã có trong working tree khi thiết kế lại trang chủ.
- Kiểm tra trình duyệt: trang chủ desktop, mobile 390px (scrollWidth = clientWidth = 390), lọc Lớp 12 và trạng thái khách.
- Các trang yêu cầu tài khoản chưa được kiểm thử toàn bộ bằng vai trò thật; màu được chuyển đồng bộ trong mã nguồn.
- Build production đã đạt trong workspace; bản commit thiết kế cũng cần được build độc lập trước push.
- Lint các file giao diện chính: không lỗi; còn cảnh báo img avatar từ mã hiện có.
- Dev dùng `npm run dev` với Webpack: Turbopack dev ở đường dẫn hiện tại tìm CSS từ thư mục cha, trong khi production build thành công. Tailwind chỉ quét src qua source("../").

## Nhật ký phiên thiết kế

24/09/2026: đọc hệ thiết kế nguồn; chuyển token và font; thiết kế lại trang chủ/header/footer; đồng bộ màu màn hình chức năng; kiểm tra desktop/mobile và cấu hình localhost. Chuẩn bị commit thiết kế riêng, giữ nguyên thay đổi nghiệp vụ và tài liệu lịch sử đang có ở working tree.
