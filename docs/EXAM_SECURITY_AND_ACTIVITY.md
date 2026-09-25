# Mật khẩu, lịch mở đề và nhật ký thời gian

Cập nhật ngày 25/09/2026.

## Cấu hình đề thi

- `duration`: số phút làm bài tính từ lúc học sinh bắt đầu.
- `startTime`: thời điểm server cho phép mở đề; `null` nghĩa là mở ngay.
- `endTime`: thời điểm server đóng đề; `null` nghĩa là không giới hạn.
- Thời gian thực tế của một phiên là mốc sớm hơn giữa `duration` và `endTime`.
- Giáo viên có thể đổi giờ mở/đóng trong trang sửa đề hoặc gia hạn nhanh tại trang kết quả đề.

Mật khẩu không được lưu trong tài liệu `exams`. `exams.requiresPassword` chỉ là cờ hiển thị; salt và hash scrypt nằm trong `exam_secrets/{examId}`. Firestore Rules chặn toàn bộ client đọc/ghi collection này. API `/api/exams/[examId]/access` xác minh ID token, thời gian server và mật khẩu trước khi trả nội dung đề.

## Nhật ký bài làm

Bài nộp mới có thêm các trường:

- `activityLog`: tối đa 500 sự kiện vào câu, chọn/nhập đáp án, rời câu và nộp bài.
- `questionTimings`: tổng số giây, số lượt vào và thời điểm trả lời cuối theo từng câu.
- `totalElapsedSeconds`: tổng thời gian từ lúc bắt đầu tới lúc nộp.
- `lastInteractionAtSeconds`: thời điểm tương tác cuối tính từ lúc bắt đầu.
- `idleBeforeSubmitSeconds`: khoảng thời gian từ tương tác cuối tới lúc nộp.

Khi học sinh chuyển câu, snapshot nhật ký và đáp án được cập nhật vào bản ghi `IN_PROGRESS`. Khi nộp, thoát có lưu hoặc hết giờ, hệ thống ghi snapshot cuối cùng. Giáo viên xem bảng tổng hợp và timeline ở trang chi tiết bài làm.

Khoảng không tương tác từ 5 phút được đánh dấu để giáo viên xem xét. Đây là tín hiệu hỗ trợ, không phải kết luận gian lận: học sinh có thể đọc, tính nháp hoặc gặp vấn đề thiết bị mà không tạo sự kiện bàn phím/chuột.

## Tương thích

- Đề cũ không có `requiresPassword` được xem là không có mật khẩu.
- Chuỗi `datetime-local` cũ được API hiểu theo múi giờ UTC+7; dữ liệu mới lưu ISO có timezone.
- Bài nộp cũ vẫn xem được đáp án và điểm, nhưng hiển thị “Bài cũ chưa có nhật ký”.
