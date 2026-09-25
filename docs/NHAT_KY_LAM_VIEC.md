# Nhật ký làm việc và đối chiếu lịch sử

Ngày tổng hợp: 24/09/2026; cập nhật gần nhất: 25/09/2026. Mốc khảo sát ban đầu: HEAD `b343840`.

## 1. Phạm vi và độ đầy đủ

- Đã kiểm tra các file Markdown của dự án, ngoài node_modules, .git, .next và các worktree phụ. README trước đó là tài liệu Next.js mặc định; AGENTS.md là hướng dẫn làm việc; CLAUDE.md tham chiếu AGENTS.md. Chưa thấy nhật ký dự án tập trung trong phạm vi này.
- Đã truy xuất hết các lượt được cung cấp của 5 tác vụ cũ liên quan trực tiếp hoặc phụ trợ. Danh sách tác vụ lưu trữ trên host local trả về rỗng.
- Đã xuất toàn bộ 36 commit thuộc lịch sử HEAD hiện tại. Commit không tương đương một phiên làm việc; không suy diễn người thực hiện hoặc số giờ từ commit.
- Các phiên website cũ ở `Desktop/website trac nghiem` được đối chiếu theo nội dung chức năng và lịch sử Git của workspace hiện tại. Không khẳng định mọi thay đổi ở đường dẫn cũ đã được chuyển đầy đủ.
- Chưa truy xuất được toàn bộ hội thoại Claude, phiên ngoài Codex, lịch sử đã xóa, nhánh Git không thuộc HEAD hoặc nhật ký triển khai Firebase/Vercel. Không gọi bộ tài liệu này là toàn bộ lịch sử tuyệt đối.
- Bản lưu hội thoại giữ tin nhắn người dùng/trợ lý được công cụ cung cấp, không phải bản sao toàn bộ tool output. Nội dung lịch sử chưa được xác thực lại sẽ được ghi rõ.

## 2. Các phiên có thể truy xuất

### 29/04/2026 — Rà soát lỗi reload mobile

Nguồn: [6 lượt trao đổi](history/019dd8e6-c241-7160-9433-1717438a925c.md).

1. Rà soát hiện tượng reload: phiên cũ nhận định áp lực bộ nhớ từ render TikZ trên mobile là nghi vấn chính; ban đầu chưa sửa.
2. Thêm utility chuyển TikZ qua QuickLaTeX; utility ban đầu chưa được tích hợp vào lưu đề.
3. Người dùng báo chưa hoạt động: kiểm tra lại tìm thấy thiếu tích hợp; sửa cách lấy URL từ response.
4. Sau khi người dùng đồng ý, thêm API xử lý TikZ, tích hợp tạo/sửa đề, ưu tiên ảnh đã xử lý khi mở bài và dùng ảnh trong review.
5. Khi QuickLaTeX báo lỗi, đổi sang báo lỗi theo từng hình thay vì hủy toàn bộ request.
6. Đề xuất chuyển sang renderer riêng; không cam kết biên dịch mọi mã TikZ thành công tuyệt đối.

Phiên cũ báo TypeScript/lint phạm vi và một số request render đạt. Hiện tại utility đã chuyển sang Hugging Face, nên kết quả QuickLaTeX không đại diện dịch vụ hiện hành. Các tuyên bố “triệt để” trong lịch sử chỉ là lời báo cáo tại thời điểm đó.

### 29/04/2026 — Tạo microservice TikZ FastAPI

Nguồn: [2 lượt trao đổi](history/019dd924-c02e-7802-9459-d558813e6de6.md), thuộc workspace phụ trợ `Desktop/bien dich Tikz`.

- Phiên cũ báo tạo Dockerfile, requirements.txt và main.py: endpoint render, biên dịch trong thư mục tạm, timeout, chuyển PDF sang PNG/Base64 và tự dọn dữ liệu tạm.
- Kiểm tra được ghi nhận là cú pháp Python; không có căn cứ từ kiểm tra đó để kết luận Docker build hoặc tải đồng thời đã đạt.
- Lượt yêu cầu tích hợp vào website bị ngắt tại tác vụ này; phần tích hợp có phiên riêng bên dưới.

### 29/04/2026 — Tích hợp render TikZ

Nguồn: [5 lượt trao đổi](history/019dd93a-a409-7af1-97cc-b7804ead7611.md).

- Chuyển utility sang gọi renderer Hugging Face; thêm API upload tiền xử lý hình trong câu hỏi, lựa chọn và lời giải trước khi lưu.
- Người dùng xác nhận render thành ảnh đã hoạt động, rồi báo hydration mismatch do thuộc tính bị chèn vào html. Sau khi được đồng ý, phiên cũ bổ sung suppressHydrationWarning ở root.
- Sửa cuộn ngang bảng/KaTeX; viết lại email kết quả 5 cột và định dạng đáp án P2/P3.
- Lượt cuối yêu cầu tối ưu ô nhập P3 không có phản hồi kết luận trong dữ liệu truy xuất. Git ngày 29/04 có các commit P3 liên quan; chưa gán chúng là kết quả chắc chắn của lượt này.
- Phiên cũ báo build đạt sau khi cho phép tải font, lint riêng đạt; lint toàn repo còn lỗi. Không coi URL localhost trong bản lưu là server vẫn chạy hôm nay.

### 05/05/2026 — Phiên ID 019df66a-c6ec-7403-b4ab-6fffdcdfc7a2

Nguồn: [yêu cầu được lưu](history/019df66a-c6ec-7403-b4ab-6fffdcdfc7a2.md). Dữ liệu read_thread không có title; danh sách tác vụ dùng toàn bộ prompt dài làm tên, nên ở đây nhận diện bằng ID.

Yêu cầu: hồ sơ/số điện thoại giáo viên, sinh từ khóa tìm kiếm, trang chi tiết lớp, học sinh và bài nộp; giữ nguyên cách chấm P1/P2/P3. Dữ liệu chỉ có tin nhắn người dùng, không có kết luận triển khai. Các chức năng tương ứng hiện có trong mã và commit 1842a59/8778c5d, nhưng không đủ căn cứ gán tác giả hoặc khẳng định được hoàn thành ở chính phiên này.

### 24/09/2026 — Plan GPT-6 migration

Nguồn: [2 lượt, gồm bản dịch tiếng Việt](history/01a0d0ce-9572-7330-95f4-7b0a746b3061.md).

- Nhận định dự án chưa có tích hợp LLM để chuyển đổi; đề xuất tính năng hỗ trợ nhập đề bằng AI.
- Hướng đề xuất: giữ parser xác định, cho giáo viên xem và duyệt thay đổi, kiểm tra schema và lưu lịch sử đề xuất.
- Trạng thái: kế hoạch, chưa triển khai. Tên model, năng lực, giá hoặc API nêu trong hội thoại cũ chưa được xác minh lại trong lần lập hồ sơ; không đưa chúng vào quyết định kỹ thuật hiện hành.

### 24/09/2026 — Đánh giá chức năng dự án

Nguồn: tác vụ hiện tại `01a0d2a1-def5-70b0-96fa-50f77aacb45a`, yêu cầu khảo sát trước yêu cầu lập nhật ký.

- Đọc cấu trúc ứng dụng, auth, rules, API, parser, hooks, bài thi và lớp học.
- `npm run build`: đạt, gồm kiểm tra TypeScript. Chỉ là kết quả cục bộ.
- `npm run lint`: 102 lỗi, 62 cảnh báo, có quét worktree phụ. Kiểm tra riêng `src`: 26 lỗi, 16 cảnh báo ở 13 file có lỗi.
- Kiểm tra nhanh bằng Node/transpile TypeScript: parse P1 ngoặc lồng/phân số/lời giải, P2 đúng/sai, chuẩn hóa P3, định dạng đồng hồ, lưu/khôi phục/xóa nháp và tách người dùng đều đạt.
- Tái hiện `\\shortans[oly]{5{,}3}` cho đáp án rỗng.
- Phát hiện bất nhất quyền Firestore, chấm điểm client, lỗi email quản trị và hook chưa tích hợp. Chi tiết: [kế hoạch cải thiện](KE_HOACH_CAI_THIEN.md).
- Chưa thử end-to-end bằng các vai trò thật, chưa xác nhận rules đang triển khai và chưa đo hiệu năng trên thiết bị thật. Không sửa mã nguồn trong lượt khảo sát.

### 24/09/2026 — Lập và bổ sung hồ sơ dự án

- Kiểm tra nhật ký sẵn có; truy xuất 5 tác vụ, đối chiếu 36 commit và diff chưa commit.
- Bổ sung thư mục docs, 5 bản lưu hội thoại, danh sách commit, nhật ký, kế hoạch cải thiện và định hướng sản phẩm; thêm đường dẫn vào README.
- Tách kết quả đã kiểm tra khỏi báo cáo lịch sử và các đề xuất chưa triển khai. Kiểm tra liên kết nội bộ của bộ tài liệu mới và diff tài liệu; không chạy lại build vì không sửa mã ứng dụng.
- Việc tiếp theo đề xuất: xử lý P0/P1 và kiểm thử rules trên môi trường riêng trước khi mở rộng chức năng.

### 24–25/09/2026 — Thiết kế phong thủy và sửa quyền mở đề

- Đối chiếu quy chuẩn từ dự án “Website Gia Sư”: mệnh Lộ Bàng Thổ, tỷ lệ màu 60% nền ngà/cát, 30% hổ phách/nâu đất, 10% cam hoàng hôn; không dùng xanh lá làm màu trạng thái.
- Áp dụng hệ màu và kiểu chữ Be Vietnam Pro cho trang chủ, header, sidebar, footer, trang quản trị, lớp học, làm bài và review. Bổ sung tài liệu [hệ thống thiết kế](DESIGN_SYSTEM.md).
- Chuyển script dev sang Next Webpack vì Turbopack tìm sai thư mục gốc khi workspace nằm cạnh một dự án cha có cấu hình Tailwind.
- Sửa `FirebaseError: Missing or insufficient permissions` ở `/quiz/[id]`: trước đó Server Component gọi Firebase Web SDK mà không có phiên Auth của trình duyệt. Trang mới chỉ đọc đề phía client sau khi Auth hoàn tất; khách được yêu cầu đăng nhập; lỗi không tồn tại, thiếu quyền và lỗi dịch vụ có trạng thái riêng.
- Bổ sung rules cho onboarding, tìm giáo viên, học sinh vào lớp và `class_members`; khóa việc người dùng tự nâng vai trò qua cập nhật hồ sơ. Rules mới chỉ được lưu trong mã nguồn, chưa triển khai lên Firebase.
- Kiểm tra cục bộ: ESLint hai file sửa lỗi đạt; `tsc --noEmit` đạt; build production Webpack đạt đủ 17 route; mở `/quiz/test` khi chưa đăng nhập hiển thị đúng màn hình đăng nhập và console không có lỗi/cảnh báo; trang chủ đã kiểm tra desktop/mobile, không tràn ngang ở viewport 390 px.
- Trạng thái: giao diện đã commit tại `3ac4b5a`; sửa Firebase, bảo mật API/lớp học và bộ tài liệu nằm trong commit tiếp theo của cùng phiên. Localhost chạy tại `http://localhost:3000`.
- Giới hạn: chưa thử end-to-end với tài khoản học sinh/giáo viên thật; chưa chạy Firebase Emulator test cho rules; chưa triển khai Firebase rules hoặc website production.

### 25/09/2026 — Sửa chức năng xóa lớp

- Tái kiểm tra luồng `TeacherClassPanel → classroomService → Firestore`: phiên bản cũ đọc `class_members` và xóa trực tiếp từ browser, nên thất bại khi rules đang triển khai chưa cấp quyền collection này.
- Chuyển thao tác sang `DELETE /api/classes/[classId]`. API xác minh Firebase ID token, chỉ chấp nhận chủ lớp hoặc admin, xóa tài liệu thành viên theo batch, tách lớp khỏi nhóm rồi xóa lớp.
- Client gửi ID token hiện hành và hiển thị riêng lỗi hết phiên, không có quyền, không tìm thấy hoặc lỗi máy chủ.
- Kiểm tra cục bộ: ESLint các file thay đổi đạt; TypeScript đạt; build production đạt và nhận route API mới; request xóa không có token trả đúng HTTP 401 `UNAUTHENTICATED`.
- Giới hạn: không xóa thử lớp thật vì đây là thao tác mất dữ liệu; cần kiểm tra cuối với một lớp thử nghiệm khi đã đăng nhập giáo viên.

### 25/09/2026 — Nhật ký thời gian, mật khẩu và lịch mở đề

- Xác nhận hệ thống đã có `duration`, `startTime`, `endTime` và kiểm tra ở màn hình bắt đầu, nhưng chưa có mật khẩu; mốc đóng chưa giới hạn phiên đang làm và kiểm tra lịch chưa dựa hoàn toàn vào server.
- Thêm nhật ký tối đa 500 sự kiện cho mỗi bài: vào/rời câu, chọn đáp án, snapshot trả lời ngắn khi chuyển câu, số lượt xem và thời gian theo từng câu. Lưu tổng thời gian, tương tác cuối và khoảng không tương tác trước khi nộp.
- Trang giáo viên xem bài làm hiển thị tổng thời gian, bảng từng câu, timeline và cảnh báo khi không tương tác ít nhất 5 phút. Trang kết quả đề có cột thời gian và liên kết tới nhật ký.
- Thêm mật khẩu đề thi: tạo/đổi/gỡ; dùng salt + scrypt hash trong `exam_secrets`, không lưu mật khẩu rõ trong `exams`; rules chặn client đọc/ghi secrets.
- Thêm API mở đề xác minh Firebase ID token, giờ server và mật khẩu. Đề mới lưu thời gian ISO có timezone; dữ liệu `datetime-local` cũ được hiểu theo UTC+7.
- Khi đang làm, đồng hồ dùng mốc sớm hơn giữa thời lượng phiên và giờ đóng đề. Giáo viên có thể gia hạn nhanh tại trang kết quả hoặc chỉnh lịch trong trang sửa đề.
- Kiểm tra cục bộ: ESLint phần thay đổi không có lỗi, TypeScript và production build đạt; API mở đề không có token trả HTTP 401; hàm hash xác minh đúng mật khẩu và từ chối mật khẩu sai.
- Giới hạn: chưa chạy end-to-end bằng hai tài khoản giáo viên/học sinh thật; cảnh báo không tương tác chỉ là tín hiệu hỗ trợ, không tự kết luận gian lận.

### 25/09/2026 — Sửa chức năng tạo lớp

- Tái hiện từ ảnh người dùng và kiểm tra mã: form tạo lớp vẫn ghi trực tiếp vào Firestore từ trình duyệt, nên phụ thuộc vào bộ rules đang triển khai và chỉ trả thông báo lỗi chung khi bị từ chối quyền.
- Chuyển thao tác sang `POST /api/classes`. API xác minh Firebase ID token và vai trò `mod`/`admin`, tự lấy mã lớp duy nhất và danh tính giáo viên từ hồ sơ máy chủ, kiểm tra tên, mô tả và sĩ số trước khi ghi bằng Admin SDK.
- Client không còn gửi hoặc tin cậy `teacherId`/`teacherName`; bổ sung thông báo riêng cho hết phiên, thiếu quyền, dữ liệu không hợp lệ và lỗi máy chủ.
- Kiểm tra cục bộ: ESLint các file thay đổi đạt; TypeScript đạt; production build đạt và nhận route `/api/classes`; request tạo lớp không có token trả đúng HTTP 401 `UNAUTHENTICATED`.
- Giới hạn: không tự tạo dữ liệu lớp thật khi chưa có phiên đăng nhập giáo viên trong trình duyệt kiểm thử; người dùng cần thử lại thao tác tạo lớp bằng tài khoản hiện tại.

### 25/09/2026 — Khóa học, tài nguyên và bài thi trong lớp

- Bổ sung không gian học tập cho từng lớp với nhiều khóa học độc lập. Giáo viên có thể tạo, sửa, xuất bản hoặc giữ bản nháp và xóa khóa học.
- Mỗi khóa học nhận tài nguyên qua liên kết chia sẻ: PDF/tài liệu, video và PPTX/Slides. Hệ thống chuẩn hóa liên kết Google Drive, Google Slides, YouTube và Vimeo để xem nhúng; nguồn khác dùng URL xem công khai và luôn có nút mở liên kết gốc.
- Giáo viên có thể thêm, sửa, xóa và đổi thứ tự tài nguyên. Học sinh chỉ thấy khóa học đã xuất bản và chỉ khi đang là thành viên lớp.
- Hiển thị toàn bộ bài kiểm tra được giao qua `targetClassIds` hoặc trường `classIds` cũ; phân loại đang mở, sắp mở, đã đóng; lọc theo trạng thái và sắp xếp theo trạng thái, mới nhất hoặc cũ nhất.
- Với học sinh, bài đã nộp hiển thị điểm và liên kết xem kết quả; đề chưa mở hoặc đã đóng không có nút bắt đầu làm. Khi xóa lớp, API dọn cả dữ liệu khóa học liên quan.
- Kiểm tra cục bộ: ESLint phần thay đổi đạt; TypeScript đạt; production build đạt và nhận hai route động mới; 5 trường hợp chuẩn hóa liên kết Drive/YouTube/Vimeo/Slides và chặn protocol nguy hiểm đều đạt; API nội dung không có token trả đúng HTTP 401; trang chi tiết lớp khi chưa đăng nhập hiển thị đúng trạng thái yêu cầu đăng nhập.
- Giới hạn: chưa tạo dữ liệu khóa học thật vì trình duyệt kiểm thử không có phiên giáo viên; khả năng xem nhúng của nguồn lưu trữ ngoài phụ thuộc việc nguồn đó cho phép iframe và quyền chia sẻ công khai.

### 25/09/2026 — Bài học riêng trong từng khóa học

- Mở rộng cấu trúc thành `lớp → khóa học → bài học → tài nguyên`. Mỗi bài học có tên và mô tả riêng; giáo viên có thể tạo, sửa, xóa và đổi thứ tự bài học.
- PDF, video và PPTX/Slides được thêm vào từng bài học cụ thể; thứ tự tài nguyên được quản lý độc lập trong mỗi bài.
- Dữ liệu khóa học phiên bản cũ có tài nguyên trực tiếp được hiển thị dưới bài “Tài liệu khóa học” và tự chuyển sang cấu trúc mới khi giáo viên chỉnh sửa.
- Biểu mẫu bài học và tài nguyên dùng hộp thoại nổi để luôn nhìn thấy khi khóa học có nội dung dài.
- Kiểm tra cục bộ: ESLint phần thay đổi đạt; TypeScript đạt; production build đạt và giữ đủ các route lớp học.

## 3. Tiến trình Git

Chi tiết từng hash/thời gian/thông điệp: [36 commit](history/git-commits.txt). Nội dung dưới đây tóm tắt theo thông điệp commit, không xác nhận lại mọi diff hoặc deployment.

| Giai đoạn | Nội dung ghi nhận |
| --- | --- |
| 27–28/04 | Khởi tạo, hệ thống LMS, đăng nhập mobile/Safari, Wake Lock, tối ưu bộ nhớ, cấu hình Vercel |
| 29/04 | TikZ/mobile, hydration, tiện ích chấm/hiển thị, nhập P3 và nút dấu trừ |
| 05/05 | Quản lý lớp, drill-down, hồ sơ giáo viên, tìm kiếm tiếng Việt, DevPanel |
| 06/05 | Upload file và thay đổi Header; thông điệp ít chi tiết nên không suy diễn chức năng |
| 08/05 | Macro toán Việt Nam, xử lý lỗi TikZ, lời giải, bảng HTML, PNG/SVG và MIME |
| 14/05 | Link vào lớp, giao đề theo lớp, xuất điểm |
| 19/05 | Thêm/xóa học sinh, xuất bảng điểm, xem thử vai học sinh, cảnh báo rời bài, thư viện calc |
| 21/05 | Sửa link xem bài trong email theo origin request |

Diễn biến cần giữ đúng: thử chuyển bảng thành ảnh ngày 08/05 đã được thay bằng render bảng HTML; đổi MIME SVG đã được tiếp nối bằng xử lý PNG/SVG. Không ghi mọi thử nghiệm trung gian là kiến trúc hiện tại.

## 4. Thay đổi chưa commit tại lúc khảo sát

Không xác định được thời điểm/tác giả chỉ từ working tree; ghi nhận là đã có sẵn trước phiên lập tài liệu.

- Thêm firebase-admin, firebaseAdmin.ts, verifyAuth.ts, firebase.json và firestore.rules.
- API upload dùng Admin SDK; các API có xác thực; một số caller thêm Bearer token.
- Trang chủ lọc đề theo lớp ở client; thêm xóa lớp trong service và giao diện giáo viên.
- Điều chỉnh .gitignore/.npmrc/package lock; một số mục worktree bị đánh dấu xóa; có tài nguyên public chưa theo dõi.
- Đây là trạng thái chưa commit/chưa xác nhận triển khai, không ghi là bản phát hành mới. Không đưa nội dung secrets hoặc tài khoản dịch vụ vào nhật ký.

## 5. Quy ước bổ sung cho phiên tiếp theo

Mỗi phiên thêm một mục; không sửa báo cáo cũ thành “đã thành công” khi chưa có bằng chứng mới. Nếu đính chính, ghi mục đính chính và dẫn mục cũ. Một tính năng chỉ đánh dấu hoàn tất khi có kết quả kiểm tra tương ứng; deployment phải ghi môi trường và phiên bản riêng.

```text
Ngày/giờ và múi giờ:
Task ID / commit / branch:
Yêu cầu và phạm vi:
Hiện trạng đầu phiên:
Thay đổi thực hiện (file/chức năng):
Kiểm tra (lệnh/kịch bản, kết quả, giới hạn):
Trạng thái: đề xuất / đang làm / đã kiểm tra cục bộ / đã triển khai
Vấn đề còn lại và việc tiếp theo:
Quyết định đã được người dùng chấp thuận:
```
