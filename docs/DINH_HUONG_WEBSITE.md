# Định hướng phát triển website

Ngày 24/09/2026. Đây là đề xuất sản phẩm dựa trên chức năng hiện có và nhu cầu đã xuất hiện trong các phiên làm việc, chưa phải nghiên cứu thị trường hoặc quyết định kinh doanh đã được người dùng thông qua.

## 1. Hướng đề xuất

**Xây dựng công cụ dạy, luyện tập và kiểm tra Toán cho giáo viên THPT, ưu tiên trải nghiệm học sinh trên điện thoại.**

Giá trị cốt lõi: giáo viên đưa đề LaTeX/TikZ sẵn có lên hệ thống, giao đúng lớp, thu bài đáng tin cậy, rồi biết học sinh cần học lại nội dung nào. Thế mạnh sẵn có là xử lý nội dung Toán tiếng Việt, ba dạng câu hỏi, lớp học và bảng điểm.

Giả thuyết cần kiểm chứng: nhóm người dùng đầu tiên là giáo viên đang có kho đề LaTeX và lớp học của mình. Chọn một khối/chuyên đề làm pilot thay vì mở đồng thời mọi môn và mọi cấp học.

## 2. So sánh các hướng đi

| Hướng | Phù hợp hiện trạng | Giá trị | Đòi hỏi thêm | Khuyến nghị |
| --- | --- | --- | --- | --- |
| Công cụ cho giáo viên/lớp học | Cao | Tiết kiệm thời gian nhập đề, giao bài, chấm và theo dõi | Thi ổn định, quyền sở hữu, nhập đề tốt, hỗ trợ vận hành | Làm trước |
| Nền tảng tự luyện cho học sinh | Trung bình | Học theo chủ đề, biết điểm yếu, ôn câu sai | Kho câu có gắn nhãn, lời giải chất lượng, tiến độ và động lực học | Phát triển sau khi có dữ liệu đủ tốt |
| Dịch vụ cho tổ bộ môn/trung tâm | Trung bình | Nhiều giáo viên dùng chung, thống kê và quản lý tập trung | Ranh giới tổ chức, quản trị thành viên, sao lưu, hỗ trợ và chi phí | Thử khi pilot nhiều giáo viên có nhu cầu |
| Công cụ biên soạn đề có AI | Có tiềm năng, chưa có tích hợp | Hỗ trợ nhập/sửa dữ liệu và soạn lời giải | Bộ đánh giá, giáo viên duyệt, giới hạn chi phí, nguồn nội dung | Tính năng bổ sung về sau |
| Kho đề cộng đồng/chợ nội dung | Thấp ở thời điểm này | Chia sẻ và khám phá nội dung | Quyền sử dụng, kiểm duyệt, phiên bản, chống trùng, thanh toán nếu có | Hoãn cho tới khi chất lượng kho riêng ổn định |

Không chọn nền tảng thi quy mô lớn làm lời hứa sản phẩm ngay lúc này: chưa có bằng chứng kiểm thử tải, bảo toàn phiên, chấm server và vận hành sự cố.

## 3. Trải nghiệm sản phẩm nên hướng tới

**Giáo viên:** tạo lớp → nhập đề → kiểm tra lỗi/cảnh báo → xem thử → công bố phiên bản → giao lớp/hạn làm → theo dõi nộp bài → xem câu nhiều học sinh sai → giao bài củng cố.

**Học sinh:** vào lớp → thấy bài cần làm và hạn nộp → làm bài có trạng thái lưu rõ ràng → nhận xác nhận nộp → xem lời giải theo thời điểm giáo viên cho phép → ôn lại câu sai.

Trang chủ nên theo vai trò: học sinh thấy “Bài cần làm / Đang làm / Đã hoàn thành”; giáo viên thấy “Lớp của tôi / Đề đang soạn / Bài cần theo dõi”. Kho đề vẫn có trang riêng và bộ lọc.

Tách chế độ **luyện tập** và **kiểm tra**: luyện tập có thể cho phản hồi sớm, làm lại và xem gợi ý; kiểm tra dùng giờ/lượt server, chính sách công bố lời giải, lưu phiên bản và bài nộp bất biến. Hai chế độ dùng chung nội dung câu hỏi nhưng khác chính sách.

## 4. Các giai đoạn phát triển

### Giai đoạn A — Dùng ổn định cho một nhóm lớp

Phạm vi: sửa P0/P1 trong kế hoạch cải thiện; hoàn chỉnh đăng ký, vào lớp, mở đề, làm/nộp/khôi phục, review và xuất điểm; hướng dẫn giáo viên nhập đề và xử lý hình lỗi.

Điều kiện chuyển giai đoạn: toàn bộ ca nghiệm thu trọng yếu đạt; không còn lỗi mất bài/ghi đè điểm/phân quyền đã biết; pilot hoàn tất và giáo viên đối chiếu được kết quả. Ghi rõ môi trường và bản triển khai.

### Giai đoạn B — Ngân hàng câu hỏi và giao bài linh hoạt

- Gắn nhãn khối, chương, chủ đề, dạng câu và mức độ do giáo viên duyệt.
- Lưu nguồn và quyền sử dụng; tìm kiếm/lọc; phát hiện câu trùng để giáo viên xử lý.
- Tạo đề từ ma trận số câu/chủ đề, bản nháp/xuất bản, phiên bản và trộn đề xác định.
- Tái sử dụng câu hỏi giữa các đề nhưng không làm biến đổi đề đã thi.

Điều kiện chuyển: đo thời gian tạo đề trên cùng một bộ đề trước/sau; câu hỏi có metadata đủ dùng; review bài cũ không đổi khi sửa ngân hàng.

### Giai đoạn C — Theo dõi tiến bộ và ôn tập

- Sổ câu sai của từng học sinh; bài luyện theo chủ đề yếu; mục tiêu ôn tập theo tuần.
- Báo cáo từng câu: tỷ lệ đúng, bỏ trống, lựa chọn sai phổ biến; giáo viên giao lại nội dung cần ôn.
- Biểu đồ tiến bộ chỉ so sánh các bài tương đương; khi số mẫu ít phải ghi rõ chưa đủ dữ liệu.
- Kết quả P2 cần xem từng ý để phản hồi học tập, không chỉ tổng điểm.

Điều kiện chuyển: học sinh quay lại ôn và giáo viên sử dụng báo cáo để giao bài; theo dõi tiến bộ bằng kiểm tra tương đương, không đồng nhất tăng điểm do làm lại với tăng năng lực.

### Giai đoạn D — Nhiều giáo viên và trợ lý nội dung

- Không gian tổ bộ môn/trung tâm, quyền chia sẻ rõ ràng, lịch sử chỉnh sửa và thống kê theo tổ chức.
- AI hỗ trợ phát hiện lỗi nhập đề, gợi ý nhãn hoặc lời giải; giáo viên xem khác biệt và chấp nhận từng thay đổi.
- Đánh giá chất lượng bằng bộ đề đại diện, bảo toàn đáp án, tỷ lệ chấp nhận và chi phí. Chọn nhà cung cấp/model sau khi kiểm chứng tài liệu và kết quả thực nghiệm tại thời điểm triển khai.
- Không để AI tự thay đáp án đề đã công bố hoặc quyết định điểm chính thức; nội dung không được duyệt giữ ở nháp.

Chỉ mở giai đoạn này khi có nhu cầu đã ghi nhận từ pilot và nguồn lực vận hành phù hợp.

## 5. Cách đo hiệu quả

Các chỉ số bên dưới là đề xuất cần thu thập baseline, không phải số liệu hiện có.

| Mục tiêu | Chỉ số | Cách dùng |
| --- | --- | --- |
| Bài thi đáng tin cậy | Tỷ lệ lưu/nộp thành công, số bài mất hoặc trùng, số sự cố quyền | Mọi sự cố mất bài/phân quyền là chặn phát hành cho đến khi xử lý |
| Giáo viên tiết kiệm thời gian | Thời gian từ nhập đề tới sẵn sàng giao; số lỗi cần sửa thủ công | So sánh cùng loại và độ dài đề |
| Nội dung hiển thị đúng | Tỷ lệ parse/render đạt trên bộ đề chuẩn, lỗi theo thiết bị | Phân tách lỗi parser, renderer và mạng |
| Có giá trị học tập | Tỷ lệ quay lại ôn câu sai, hoàn thành bài củng cố, kết quả bài tương đương | Dùng để cải thiện nội dung, không tự gán quan hệ nhân quả |
| Vận hành bền vững | Số đọc dữ liệu/lượt thi, dung lượng hình, thời gian render và công hỗ trợ | Làm cơ sở dự toán và quyết định mở rộng |

Trước khi chốt phạm vi B/C/D, thực hiện pilot đề xuất với 3–5 giáo viên và một vài lớp; đây là quy mô thử nghiệm gợi ý, không phải yêu cầu về năng lực hệ thống. Phỏng vấn về thao tác tốn thời gian, dạng LaTeX hay lỗi, nhu cầu báo cáo và cách họ hiện giao/chấm bài.

## 6. Hướng vận hành và doanh thu nếu cần

Trước hết xác định website phục vụ cá nhân, trường học hay kinh doanh. Nếu có mục tiêu kinh doanh, có thể thử gói theo giáo viên hoặc tổ chức, giới hạn theo mức sử dụng thực tế. Chưa chốt mức giá hoặc hứa dung lượng không giới hạn khi chưa đo chi phí hình, dữ liệu, email và hỗ trợ.

Giữ khả năng xuất dữ liệu lớp/điểm; quy định người có quyền xem và thời gian lưu bài. Trước khi mở nhiều tổ chức, kiểm chứng phân tách dữ liệu, sao lưu/khôi phục và quy trình hỗ trợ sự cố.

## 7. Quyết định đề xuất cho chu kỳ tiếp theo

Tập trung chu kỳ đầu vào: **đăng ký → vào lớp → mở đề → làm bài → nộp và xem kết quả** hoạt động đúng dưới quyền thực tế. Sau đó ưu tiên ngân hàng câu hỏi và sổ câu sai. Chưa cần viết lại stack, tích hợp thanh toán, mở chợ nội dung hay chọn một model AI cụ thể.

Danh sách công việc kỹ thuật và điều kiện nghiệm thu: [Kế hoạch cải thiện](KE_HOACH_CAI_THIEN.md).
