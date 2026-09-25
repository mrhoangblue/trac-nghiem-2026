# Đánh giá hiện trạng và kế hoạch cải thiện

Ngày 24/09/2026. Đây là đề xuất chưa triển khai, dựa trên mã nguồn và kết quả khảo sát được lưu trong [nhật ký](NHAT_KY_LAM_VIEC.md). P0 = cần xử lý trước kỳ thi thật; P1 = cần cho vận hành ổn định; P2 = nâng chất lượng và mở rộng.

## 1. Phần đã có nền tảng tốt

- Build và TypeScript cục bộ đạt. Parser qua các mẫu cơ bản P1/P2/P3; tiện ích nháp qua kiểm tra lưu, khôi phục, phân tách người dùng và xóa.
- Có vòng chức năng tạo đề → làm bài → xem lại; có giao diện lớp, hồ sơ, bảng điểm và xuất dữ liệu. Sự hiện diện của mã không thay thế kiểm thử end-to-end.
- Tách đồng hồ khỏi phần đề; có Wake Lock, lưu nháp và khôi phục phiên; tiền xử lý TikZ phía server giảm nhu cầu render nặng trên điện thoại.
- API đã bắt đầu có xác thực. Cần hoàn thiện quyền sở hữu và tính nhất quán giữa server, caller và Firestore rules.

## 2. Danh sách cải thiện ưu tiên

| ID | Mức | Bằng chứng / vấn đề | Giải pháp đề xuất | Điều kiện nghiệm thu |
| --- | --- | --- | --- | --- |
| AUTH-01 | P0 | firestore.rules cho chủ hồ sơ update mọi trường; verifyAuth tin role từ hồ sơ | Chỉ cho sửa trường hồ sơ cho phép; role/uid/email quản lý riêng. Chỉ admin có quyền cấp vai trò, kiểm tra cả API và rules | Học sinh không tự đổi role; mod không tự cấp admin; kiểm tra tài khoản khác và không đăng nhập đều bị từ chối |
| AUTH-02 | P0 | Onboarding setDoc nhưng rules create chỉ cho staff | Cho tự tạo hồ sơ với UID/email khớp token, role giới hạn student/pending_teacher; hoặc API onboarding kiểm soát schema. Khởi tạo admin qua luồng quản trị tin cậy | Tài khoản Google mới hoàn tất hồ sơ; không tạo hồ sơ cho UID khác; lỗi mạng không làm loading vô hạn |
| EXAM-01 | P0 | quiz/[id]/page.tsx dùng client Firestore ở server, thiếu xác thực học sinh | Đọc qua server với session/token đã kiểm chứng, kiểm tra quyền đề trước khi trả nội dung | Học sinh đúng lớp mở được; ngoài lớp/không đăng nhập bị chặn; phân biệt 403, 404 và lỗi dịch vụ |
| EXAM-02 | P0 | Đáp án và điểm ở client; bài nộp do client tự ghi | Tách đề học sinh khỏi đáp án; server bắt đầu phiên, chấm bài, kiểm tra giờ/lượt và lưu điểm. Client chỉ gửi đáp án | Thay điểm trong request không tác dụng; không lộ đáp án trước thời điểm cho phép; gửi lặp không sinh bài mới |
| CLASS-01 | P1 | joinClass cập nhật classes rồi class_members; rules không hỗ trợ học sinh và thiếu collection membership | API vào lớp kiểm tra mã, trạng thái, sức chứa; transaction cập nhật thành viên và số lượng. Chọn một nguồn sự thật cho membership | Hai người vào chỗ cuối cùng không vượt sĩ số; gọi lặp không trùng; không có ghi dở dang |
| CLASS-02 | P1 | searchTeachers đọc users trong khi rules chỉ cho chính chủ/staff; xóa lớp cần đọc class_members đang bị chặn | Hồ sơ giáo viên công khai chỉ chứa thông tin cần tìm; dữ liệu riêng tách biệt. Quản lý/xóa hoặc lưu trữ lớp qua API kiểm tra chủ sở hữu | Học sinh tìm giáo viên được mà không đọc hồ sơ riêng; giáo viên A không quản lý lớp B |
| MAIL-01 | P1 | Admin exam page thiếu Bearer; API chỉ nhận email trùng người gọi | API nhận submissionId, đọc kết quả đã chấm trên server; cho chính học sinh hoặc giáo viên sở hữu bài thi gửi; giới hạn số lần và lưu trạng thái | Hai vai trò hợp lệ gửi được; giáo viên khác bị chặn; email lấy điểm thật; lỗi SMTP không làm mất bài nộp |
| PARSE-01 | P1 | shortans có tham số [oly] trả đáp án rỗng trong kiểm tra | Parser bỏ qua tham số tùy chọn, kiểm tra ngoặc cân bằng; schema kiểm tra số lựa chọn, đáp án và ID | Bộ đề hồi quy có shortans[oly], ngoặc lồng, TikZ, dữ liệu lỗi; không lưu đáp án rỗng âm thầm |
| TIME-01 | P1 | CountdownTimer giảm theo số lần setInterval; bắt đầu bài vẫn tiếp tục khi ghi phiên lỗi | Lấy expiresAt từ server; mỗi tick tính hiệu thời gian; khi quay lại tab đồng bộ lại. Báo rõ chưa tạo phiên/chưa đồng bộ | Thử chuyển nền, ngủ máy, reload, mất mạng và đổi đồng hồ thiết bị; quyết định quá hạn thuộc server |
| SAVE-01 | P1 | Nháp localStorage, các trường hợp ghi thất bại xử lý chưa đủ chắc chắn | Autosave server có số phiên bản, trạng thái đang lưu/đã lưu/lỗi; nháp local là dự phòng; retry có kiểm soát | Không mất đáp án khi reload; xử lý hai tab; mất mạng lúc nộp có thông báo và đường phục hồi |
| QUALITY-01 | P1 | src còn 26 lint errors/16 warnings; chưa có bộ test luồng chính | Loại worktree khỏi lint; xử lý lỗi nguồn; thêm test parser/chấm điểm/rules và E2E theo vai trò | CI build/lint/test đạt; bộ chấm mới khớp kết quả tham chiếu P1/P2/P3 |
| SHUFFLE-01 | P2 | useExamShuffle có mã nhưng chưa tích hợp | Seed theo attempt, lưu thứ tự và ánh xạ gốc trên server; review dùng cùng phiên bản đề | Reload không đổi mã đề; đảo lựa chọn không đổi điểm; email/review hiển thị đúng thứ tự |
| LOG-01 | P2 | useAntiCheat chưa tích hợp; hiện có đếm chuyển tab riêng | Hợp nhất logging, lưu sự kiện tối thiểu; hiển thị là tín hiệu cần xem xét | Không kết luận gian lận chỉ vì đổi tab; không đếm trùng; có chính sách lưu/xóa nhật ký |
| PERF-01 | P2 | Trang chủ tải mọi tài liệu exams; dashboard có truy vấn theo từng đề | Metadata riêng, phân trang/cursor, thống kê tổng hợp, đo số đọc và kích thước payload | Trang danh sách không tải đáp án/hình của toàn bộ kho; đo được cải thiện trên tập dữ liệu đại diện |
| TIKZ-01 | P2 | Render phụ thuộc dịch vụ ngoài; ảnh Base64 trong tài liệu đề | Hàng đợi render, giới hạn đồng thời, cache theo mã+preamble+phiên bản renderer; lưu ảnh ở object storage và trạng thái từng hình | Đề nhiều hình không phụ thuộc một request dài; retry không render lại mọi hình; chưa ready không phát hành âm thầm |

Nguồn mã cần xem: `firestore.rules`, `src/lib/AuthContext.tsx`, `src/lib/verifyAuth.ts`, `src/lib/classroomService.ts`, `src/components/QuizClient.tsx`, `src/utils/latexParser.ts`, `src/app/quiz/[id]/page.tsx`, `src/app/api/send-result/route.ts`, `src/app/admin/exam/[id]/page.tsx`.

Quyền sửa trường có thể giới hạn bằng diff/affectedKeys theo [tài liệu Firebase về kiểm soát trường](https://firebase.google.com/docs/firestore/security/rules-fields). Cần tách đáp án sang tài liệu riêng vì quyền đọc Firestore áp dụng trên tài liệu, không che riêng một trường khi đã cho đọc.

Đối với vào lớp, chọn transaction khi phải đọc/kiểm tra sức chứa rồi ghi; batch phù hợp khi chỉ cần nhóm các ghi đã xác định. Tham khảo [transaction và batched writes](https://firebase.google.com/docs/firestore/manage-data/transactions).

## 3. Kiến trúc đích đề xuất

Giữ Next.js, Firebase và renderer hiện tại trong giai đoạn ổn định; chưa có bằng chứng cần viết lại toàn hệ thống.

1. **Danh mục đề:** metadata để liệt kê, không kèm đáp án; API/rules xác định ai được xem.
2. **Phiên bản đề:** nội dung câu hỏi có examVersion; đáp án và cấu hình chấm riêng phía server. Đề đã có bài nộp không bị sửa đè; chỉnh sửa tạo phiên bản mới.
3. **Lần làm bài:** attemptId, studentUid, examVersion, startedAt, expiresAt, status; seed và thứ tự cố định nếu có trộn.
4. **Bài nộp:** lưu đáp án, phiên bản chấm, điểm server và thời điểm nhận. Khóa sau hoàn thành; sửa điểm bằng sự kiện quản trị có lý do, không ghi đè không dấu vết.
5. **Lớp/thành viên:** định danh UID, kiểm tra chủ sở hữu bằng server; mã vào lớp có thể đổi. Ưu tiên lưu trữ lớp khi kết thúc thay vì xóa lịch sử điểm.
6. **Tác vụ nền:** render hình và email có trạng thái pending/running/succeeded/failed; retry có giới hạn và chống trùng.

Admin SDK không được coi là cơ chế phân quyền ứng dụng: API dùng SDK này phải tự xác thực, kiểm tra quyền và validate dữ liệu. Ví dụ authorId/authorEmail lấy từ danh tính đã xác minh, không lấy trực tiếp từ body upload.

## 4. Bảo toàn dữ liệu và cách chuyển đổi

- Trước khi chuyển sang chấm server, đóng băng bộ ca kiểm thử điểm hiện tại. Giữ công thức P1/P2/P3 trừ khi giáo viên chủ động thay đổi quy chế.
- Viết chuyển đổi có dry-run và báo số bản ghi; dùng UID thay email dần dần, giữ trường legacy trong thời gian tương thích.
- Bài nộp cũ giữ điểm gốc; chỉ chấm lại khi có yêu cầu rõ ràng và lưu lý do/phiên bản chấm.
- Đề mới lưu phiên bản đầy đủ; đề cũ chưa đủ dữ liệu phải đánh dấu legacy, không tự dựng lại một snapshot rồi coi là bản gốc.
- Tách dữ liệu giáo viên xem thử khỏi thống kê học sinh; đối chiếu các bài đã có isTeacherPreview.
- Có bản sao dữ liệu và kế hoạch quay lại trước migration; triển khai thử trên môi trường riêng rồi mới mở nhóm giáo viên nhỏ.

## 5. Bộ nghiệm thu tối thiểu

| Nhóm | Kịch bản bắt buộc |
| --- | --- |
| Quyền | Chưa đăng nhập; học sinh A/B; giáo viên A/B; admin; tài khoản mới; vai trò bị thu hồi |
| Tạo đề | P1/P2/P3 chuẩn; thiếu đáp án; tham số LaTeX tùy chọn; TikZ lỗi một phần; đề nhiều hình |
| Làm bài | Vào đúng/sai lớp; trước giờ/sau giờ; hết lượt; double-click bắt đầu; nộp lặp; sửa payload điểm |
| Khôi phục | Reload, mất mạng rồi nối lại, hai tab, nền điện thoại và hết giờ khi đang mất kết nối |
| Sau thi | Điểm/review/email/export khớp; không trộn bài xem thử; sửa đề không làm đổi bài cũ |
| Thiết bị | Safari iPhone, Chrome Android, desktop; bàn phím P3, dấu âm/thập phân, bảng rộng, hình lớn |

Rules cần test độc lập bằng [Firebase Emulator và thư viện kiểm thử rules](https://firebase.google.com/docs/rules/unit-tests), bao gồm cả các request bị từ chối. Build thành công không chứng minh rules đúng.

## 6. Thứ tự thực hiện

1. AUTH-01/02 và thiết lập test rules; xác nhận rules thực tế trên môi trường triển khai.
2. EXAM-01/02, phiên bản đề và chấm server, khóa quyền đọc đáp án.
3. CLASS-01/02, MAIL-01, PARSE-01, TIME-01, SAVE-01; hoàn thiện QUALITY-01.
4. Chạy pilot có giáo viên/học sinh thật; xử lý các lỗi P0/P1 trước khi mở rộng.
5. SHUFFLE-01, LOG-01, PERF-01, TIKZ-01 theo dữ liệu sử dụng và đo tải.

Ước lượng thời gian cần dựa trên dữ liệu thực tế, số thành viên phát triển và khả năng tiếp cận môi trường test; chưa cam kết lịch phát hành chỉ từ khảo sát mã.
