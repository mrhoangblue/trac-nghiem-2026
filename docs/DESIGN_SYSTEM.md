# Quy chuẩn giao diện website trắc nghiệm

## Định hướng 31/10/2026: "Học Toán thông minh" (thay thế các định hướng bên dưới)

Chủ dự án yêu cầu đổi hẳn phong cách: hiện đại, mượt, nhiều hiệu ứng, tham khảo các nền tảng giáo dục hàng đầu (Brilliant, Duolingo, Khan Academy, Quizlet). Bảng màu nâu đất trước đây không còn áp dụng.

- **Màu:** gradient chàm → tím → xanh trời (`#4F46E5` → `#7C3AED` → `#0EA5E9`); trung tính lạnh (`#101828` chữ, `#475467` phụ, `#EAECF0` viền, `#F7F8FC` nền). Đúng = emerald, sai/lỗi = rose, cảnh báo/huy chương = amber.
- **Token:** giữ tên cũ `brand-*`, `gray-*`, `success-*`, `danger-*` trong `globals.css` nhưng đổi giá trị, nên mọi trang tự đổi theo. Màu riêng trang chủ dùng `edu-*`.
- **Font:** Plus Jakarta Sans (`font-display`) cho tiêu đề/số liệu; Be Vietnam Pro cho nội dung; STIX Two Text cho nội dung đề. Trong `.exam-reading`, chữ cái, số và dấu thường của KaTeX cũng lấy STIX Two Text (thường + nghiêng) để công thức và lời văn cùng một kiểu chữ; ký hiệu đặc biệt, ngoặc lớn và chỉ số trên/dưới giữ font KaTeX. Công thức inline không được bọc trong `inline-block` có `overflow` (hộp đó lấy mép dưới làm đường chân chữ nên công thức bị lệch dòng); chỉ công thức hiển thị (`.katex-display`) mới cuộn ngang.
- **Thành phần dùng chung:** `.edu-btn` (nút chính gradient, vệt sáng khi rê), `.edu-card` (nhấc lên + viền gradient + vệt sáng theo con trỏ), `.edu-glass`, `.edu-dots`, `.edu-gradient-text`, `StateIcon` (ô biểu tượng gradient cho trạng thái trống/lỗi/khóa). Không dùng emoji làm biểu tượng — dùng lucide-react.
- **Chuyển động:** chỉ transform/opacity; hero hiện dần, khối hiện khi cuộn (`data-reveal`), thẻ nổi nhấp nhô, điểm kết quả đếm dần, pháo giấy khi ≥ 8 điểm. Tất cả dừng khi bật giảm chuyển động.
- **Làm bài:** cả câu hỏi và đáp án nằm trong một màn hình. `FitStage` (`src/components/QuizFit.tsx`) cho cột câu hỏi cao đúng phần màn hình còn lại; `FitCard` tự giảm `--fit` (cỡ chữ, tối thiểu 80%, 88% trên điện thoại) và `--fig` (hình vẽ, tối thiểu 45%) tới khi vừa, nếu vẫn chưa vừa thì thẻ cuộn bên trong và có vệt mờ ở đáy. Thanh tiêu đề gọn một dòng (mã đề, chế độ học sinh là chip); tên phần và cách tính điểm nằm ngay trong thẻ câu. Phương án trắc nghiệm tự xếp 4 cột / 2 cột / 1 cột theo độ dài (`optionGridClass`); Đúng/Sai là công tắc nhỏ cùng hàng với ý. Trên điện thoại đồng hồ và dãy số câu chung một hàng. Đồng hồ đổi màu khi còn ≤ 5 phút và ≤ 1 phút.
- **Khóa học:** desktop vừa đúng một màn hình (danh sách nội dung bên trái thu gọn được, tài liệu bên phải tự cuộn bên trong); mobile chỉ cuộn cả trang, danh sách nội dung gập lại phía trên, thanh "Trước / Học xong, học tiếp" dính đáy. PDF hiển thị bằng pdf.js (`PdfViewer`): các trang nối liền, vừa chiều ngang, có phóng to, chọn trang, tải về, toàn màn hình; không dùng iframe PDF vì iOS chỉ hiện trang đầu và Android không hiện. Nếu pdf.js lỗi thì quay về iframe kèm liên kết mở tab mới.
- **Tạo/sửa đề:** hai trang dùng chung `src/components/exam-editor/`. Ba thẻ theo thứ tự Nội dung đề → Thông tin đề → Thiết lập làm bài; cột phải dính theo màn hình gồm danh sách kiểm tra, nút lưu và bản xem trước. Nhập đề chỉ có Smart Input (dán toàn bộ LaTeX) và tải file DOCX/PDF/TEX; không còn ô dán riêng từng phần. Trang sửa đề ghép nguồn 3 phần đã lưu vào Smart Input; "Lưu thiết lập" và "Lưu nội dung đề" vẫn tách riêng. Trên mobile, nút lưu dính đáy màn hình. Ô chọn dùng `SelectMenu` (menu vẽ trong trang) thay cho `<select>` của trình duyệt.
- **Hộp thoại/lớp phủ:** không đặt `transform`, `filter` hay `isolation` lâu dài lên khung trang (`.app-main > div`, `.workspace-page`), vì chúng làm `position: fixed` bám theo khung và nhốt hộp thoại dưới thanh đầu trang. Hộp thoại mới nên `createPortal` ra `document.body`.
- **Đối tượng làm bài:** ba chế độ trong `src/utils/examAudience.ts`: "Công khai" (hiện ở kho đề), "Chỉ lớp được giao" (ẩn khỏi kho đề, API `/access` chặn người ngoài lớp) và "Công khai + giao lớp".
- **Chế độ học sinh:** công tắc hai vị trí Giáo viên/Học sinh ở đầu trang (mobile chỉ hiện biểu tượng) và thanh báo màu xanh trời dưới đầu trang. Đổi chế độ thì chuyển sang trang tương ứng (`counterpartPath`). Ở chế độ học sinh: trang quản lý bị khóa, "Lớp học của tôi" liệt kê lớp giáo viên dạy, trang lớp/khóa học hiện đúng như học sinh và tiến độ chỉ giữ tạm trong trình duyệt.
- **Tài khoản (`/tai-khoan`):** thẻ đầu trang gradient có ảnh đại diện (thu nhỏ 256×256 WebP ở trình duyệt rồi lưu R2 `avatars/`), các tab Hồ sơ / Học tập (giáo viên: Hiển thị đề) / Giảng dạy (chỉ giáo viên đã duyệt) / Bảo mật. Mỗi tab có nút lưu riêng, chỉ bật khi có thay đổi. Chỉ đưa vào cài đặt có tác dụng thật: cỡ chữ đề (`--exam-scale`), ẩn tên trên bảng xếp hạng, email kết quả, mặc định khi tạo đề. Ghi qua `PATCH /api/profile` (Admin SDK), không mở thêm Firestore rules.
- **Thẻ đề và thẻ khóa học:** đều dùng `.edu-card` (nhấc lên, viền gradient, vệt sáng theo con trỏ qua `trackSpotlight` trong `src/utils/spotlight.ts`). Thẻ đề là dạng **gọn** (~250px): trang chủ có dải màu khối lớp cao 80px với đường đồ thị tự vẽ (`.edu-curve`), tiêu đề, dải cấu trúc đề `ExamPartsBar compact` (TN, Đ/S, TLN, TL), một hàng "số câu · phút" + nút "Làm bài"; lưới 2/3/4 cột. Thẻ bài thi trong lớp (`ClassExamCard`): vạch màu trạng thái dọc bên trái, chip trạng thái, khung giờ mở → đóng một dòng (thanh thời gian khi đang mở), hàng cuối gồm đếm ngược + nút. Thẻ khóa học giữ dạng lớn với ảnh bìa 16:9. Không hiện mô tả mẫu khi giáo viên chưa nhập mô tả.
- **Menu trái:** mỗi mục có một tông màu riêng (`NAV_TONES`, `NavGlyph` trong `Sidebar.tsx`, dùng chung với `MobileDrawer`): ô biểu tượng nhạt khi thường, chuyển gradient khi đang mở; mục đang mở là thẻ trắng có vạch gradient bên trái. Khối lớp hiện số 10/11/12 thay cho biểu tượng. Thẻ hồ sơ trắng gọn (bấm vào mở Tài khoản), nút "Thu gọn menu" cố định ở đáy menu.
- **Trang lớp học:** đầu trang `ClassHero` dùng chung cho học sinh/giáo viên, dạng dải gọn: nút quay lại + đường dẫn ("Quản lý lớp học" / "Lớp học của tôi" › Lớp học) gộp vào đầu trang, tên lớp, một dòng phụ, chip nằm bên phải trên màn rộng. Thanh tab `ClassTabs` có biểu tượng, số đỏ báo việc chưa làm, bám dính dưới đầu trang, cuộn ngang một hàng trên điện thoại và lưu tab trên URL (`?tab=`). Thứ tự: Tổng quan · Khóa học · Bài thi · Bài tập · Xếp hạng · Học sinh (chỉ giáo viên, số yêu cầu chờ duyệt). Tab Tổng quan (`ClassOverview`) mở đầu: 4 ô số liệu bấm được, "Việc cần làm" (học sinh) / "Đang diễn ra" (giáo viên) sắp theo hạn, thông báo, cột "Tiếp tục học". Không lồng `ClassTabs` vào trong tab khác (tab lưu trên URL sẽ tranh nhau).
- **Kết quả:** thẻ điểm theo mức (xuất sắc/khá/đạt/cần cố gắng), điểm từng phần có thanh tỉ lệ, bản đồ câu đúng/sai, lọc câu sai/đúng, lời giải tự mở ở câu sai.

## Định hướng 28/09/2026: Bàn học Toán số

Tham khảo skill `frontend-design` từ kho mã nguồn Anthropic. Giao diện lấy nội dung Toán học và môi trường lớp học làm gốc: nền giấy sáng, nhịp lưới rất nhẹ, chữ nâu đậm, hổ phách cho hành động chính và xanh học thuật dành riêng cho trải nghiệm làm bài. Ảnh chân dung và nội dung thật đóng vai trò nhận diện; tránh thêm gradient, nhãn viết hoa hoặc thẻ bo tròn nếu chúng không giúp phân cấp thông tin.

- Mỗi trang chỉ có một tiêu đề cấp một và một hành động chính rõ ràng.
- Trang quản trị ưu tiên bảng, thanh công cụ và mật độ vừa phải; trang học ưu tiên dòng đọc ngắn, nội dung tuần tự và tiến độ.
- Biểu mẫu dùng cùng chiều cao, trạng thái focus, văn phong lỗi và vị trí nút lưu.
- Trạng thái tải, rỗng, lỗi và không đủ quyền phải nói rõ người dùng cần làm gì tiếp theo.
- Mobile giữ vùng chạm tối thiểu 40px, bảng được cuộn ngang và menu không che trạng thái quan trọng.

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
- Đề tự luận: màu nhấn Phần IV là violet/fuchsia (`from-fuchsia-400 to-violet-500`); khung nộp ảnh và màn chấm dùng chung `EssayAnnotator`, tọa độ nét chấm lưu theo tỉ lệ 0–1 của trang.
