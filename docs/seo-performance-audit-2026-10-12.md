# Rà soát SEO và tốc độ — 12/10/2026

## Phạm vi và skill

Áp dụng frontend-design đang cài trong Codex và đọc trực tiếp skill [seo-audit](https://github.com/coreyhaines31/marketingskills/blob/main/skills/seo-audit/SKILL.md). Không cài thêm plugin hay chạy script của kho ngoài.

Website phục vụ học Toán THPT, ưu tiên tìm kiếm trang giới thiệu và các khối lớp. Đề thi, đáp án, lớp và kết quả cá nhân vẫn giữ kiểm tra quyền truy cập; không đưa vào sitemap.

## Các vấn đề xác nhận trong mã nguồn

| Ưu tiên | Bằng chứng / ảnh hưởng | Thay đổi |
| --- | --- | --- |
| Cao | AuthProvider trả LoadingScreen cho toàn bộ cây trang khi Firebase chưa xác định phiên. Nội dung công khai phải chờ auth và hồ sơ. | Cho trang chủ / trang khối lớp render trong lúc xác thực. Các trang riêng tư vẫn giữ màn chờ. |
| Cao | Trang chủ gọi getDocs toàn bộ exams; mỗi bản ghi có thể chứa câu hỏi, đáp án và LaTeX. | Endpoint catalog xác thực và lọc quyền phía máy chủ; Firestore select chỉ lấy trường dựng card. Đề cũ thiếu questionCount vẫn có nhánh đọc để giữ số câu chính xác. Không gửi câu hỏi/đáp án về catalog. |
| Cao | Tab Thông báo gọi cùng API với Bài tập, đọc bài nộp, hồ sơ HS và ký URL cho các file không hiển thị. | Thêm tham số section, bỏ toàn bộ truy vấn và ký URL bài tập khi chỉ xem thông báo. Giữ tương thích API cũ không truyền section. |
| Vừa | Discussion, ActivityHub, Leaderboard import đồng bộ vào khối khóa học. | Tách bằng dynamic import, tải khi component được mở; có trạng thái chờ. |
| Cao | Metadata chung chung; thiếu sitemap/canonical; trang chủ phụ thuộc useSearchParams trong Suspense. | Metadata thương hiệu, canonical riêng, sitemap và robots; đọc bộ lọc từ Server Page để nội dung công khai có trong HTML. |
| Vừa | Link khối lớp dùng chuỗi query khó đọc. | /de-thi/lop-10, /de-thi/lop-11, /de-thi/lop-12, /de-thi/thi-thu-tot-nghiep-thpt. Redirect 308 từ query cũ, giữ type. Link /quiz/[id] không đổi. |
| Vừa | Spinner danh sách không phản ánh bố cục đang tải. | Khung chờ ba card, co về một cột trên mobile, tôn trọng reduced motion. |

## Thiết kế và SEO

Giữ màu nâu thương hiệu, nền kem, Be Vietnam Pro cho UI và STIX cho toán. Trạng thái chờ dùng tông nền hiện tại, không thêm hiệu ứng trang trí nặng. Các trang khối có tiêu đề, H1, mô tả, canonical riêng. Bộ lọc loại đề canonical về trang khối để hạn chế URL trùng lặp.

Các vùng admin, teacher, student, quiz, join, onboarding, upload có noindex. robots chỉ chặn API, cho crawler đọc noindex của trang riêng tư. Noindex không thay thế xác thực/quyền truy cập.

## Đo lường và giới hạn

Một lần GET trang production trước thay đổi: HTTP 200, TTFB 1,847 giây, tổng 1,850 giây, HTML 22.409 byte. Đây là phép đo từ máy phát triển, chịu ảnh hưởng mạng và cold start. Không phải Lighthouse hay Core Web Vitals thực tế, không được dùng để tuyên bố phần trăm tăng tốc.

Chưa có quyền/số liệu Search Console, chưa đo LCP/INP/CLS với phiên học sinh thực tế. Các thay đổi trên loại bỏ công việc thừa xác nhận được bằng code, nhưng hiệu quả thời gian cần theo dõi trên production.

## Bước tiếp theo

1. Gửi sitemap.xml vào Google Search Console cho domain chính; xem URL Inspection sau Google crawl lại. Trang khối hiện giới thiệu nội dung; danh sách đề vẫn yêu cầu đăng nhập, nên khả năng xếp hạng bị giới hạn bởi lượng nội dung công khai. Muốn SEO từng đề, cần trang giới thiệu công khai riêng có nội dung hữu ích, tuyệt đối không công khai đáp án/đề giao riêng.
2. Đo PageSpeed Insights và Web Vitals với mobile, ghi nhận p75 LCP/INP/CLS và thời gian API theo từng route. Không quyết định dựa trên một lần đo.
3. API bảng xếp hạng còn tổng hợp bài nộp khi mở tab. Khi lớp/đề tăng, lưu thống kê tổng hợp khi nộp hoặc reset bài, kèm cơ chế đối soát; hiện không đổi thuật toán tính điểm.
4. Tab Bài tập còn tải danh sách bài nộp và ký các URL. Giai đoạn sau nên tải bài nộp theo từng bài khi giáo viên mở, có phân trang. Không cache URL riêng tư vào cache công cộng.
5. Danh sách đề hiện chưa phân trang. Khi kho lớn, thêm truy vấn theo khối và cursor. Projection giảm payload, không tự giảm số lượt đọc Firestore.
6. Theo dõi TikZ/import Word/R2 riêng: thời gian biên dịch và upload là tác vụ máy chủ/mạng, không được giải quyết chỉ bằng chỉnh giao diện.

## Kiểm chứng bản sửa

- ESLint các file thay đổi và TypeScript: đạt.
- `next build --webpack`: đạt (build cần truy cập Google Fonts).
- `node scripts/test-catalog-activity.cjs`: 6 kiểm tra API với dependency giả lập đạt; kiểm tra lọc lớp, quyền đăng nhập và tránh truy vấn thừa. Đây không phải kiểm thử tài khoản thật trên production.
- HTTP bản build local: nội dung trang chủ/khối có sẵn trong HTML, canonical đúng, redirect 308 giữ type, slug lạ 404, sitemap có 5 URL công khai, vùng giáo viên noindex, catalog không có token trả 401.
- Mở trang khối 12 trên trình duyệt và kiểm tra bố cục ở viewport hiện tại; chưa chạy audit Lighthouse mobile hoặc phiên giáo viên/học sinh thật.
