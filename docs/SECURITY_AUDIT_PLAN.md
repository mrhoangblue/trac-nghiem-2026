# Kế hoạch sửa bảo mật (audit 2026-11-04)

Quy tắc áp dụng: coi mọi endpoint/Server Action là cổng công khai; thứ tự Auth → Zod → Ownership/IDOR → Execute → Sanitized output; `import 'server-only'` cho tầng DB/secret/service; không để `'use server'` chung file `'use client'`; kết quả `{success:true,data}|{success:false,error,code?}`.
Dự án: Trắc nghiệm = `~/Documents/WORKSPACE/1_Projects/website trac nghiem`; Gia Sư = `~/Documents/WORKSPACE/1_Projects/Website Gia Su/web`.

## Bước 1 — Trắc nghiệm: firestore.rules + /api/submissions (làm trước)
- [x] `users`: bỏ `allow create, update, delete: if isAdminOrMod()`; mod không được đổi `role`/xóa admin. Chỉ admin đổi role (tốt nhất qua API Admin SDK).
- [x] `submissions`: client không tạo/sửa `status`, `scores`, `part*Results`; chỉ cho ghi tiến độ (answersJson, activityLog…) khi IN_PROGRESS. Việc chấm điểm chỉ ở `/api/submissions`.
- [~] `exams`, `classes`, `class_members`: giáo viên chỉ sửa/xóa của chính mình (authorEmail/teacherId), admin mới sửa mọi thứ; staff không đọc bài nộp của GV khác.
- [x] `/api/submissions` (start + submit): kiểm tra lại giờ mở/đóng, lớp đích (`isClassOnly`), mật khẩu/đã qua access, và `maxRetries` ở máy chủ.
- [ ] Triển khai rules bằng `firebase deploy --only firestore:rules` SAU khi thử trên dữ liệu giả; không chạm dữ liệu thi thật.

## Bước 2 — Trắc nghiệm: không gửi đáp án cho học sinh
- [x] `/api/exams/[id]/access`: bỏ `correctAnswer`, lời giải, `rawLatex` khỏi payload học sinh (giáo viên/admin giữ nguyên).
- [x] `QuizClient.tsx`: bỏ tính điểm ở client (dòng ~705–770, 860–935), dùng điểm/chi tiết do `/api/submissions` trả về; đổi nguồn gửi email kết quả (`send-result`) sang dữ liệu máy chủ.
- [x] Chế độ xem lại (review) chỉ lấy đáp án sau khi nộp (hoặc sau khi GV công bố).
- [x] Đóng đường đọc trực tiếp `exams` cho học sinh trong rules (trong file, CHƯA deploy) (chỉ staff đọc client; học sinh qua API).
- [ ] Thử bằng trang preview dữ liệu giả hoặc Playwright mock; không start/submit đề thật.

## Bước 3 — Thư viện + vệ sinh
- [ ] Trắc nghiệm: `npm audit fix` (next, sharp, busboy, nodemailer), xem `--force` cho `@grpc/grpc-js`; thay/loại `xlsx` (không có bản vá npm) hoặc cô lập chỉ chạy trên file GV tin cậy.
- [ ] Gia Sư: nâng `zod` 3 → 4 (breaking), chạy lại test/tsc.
- [ ] Trắc nghiệm: thêm header bảo mật (CSP tối thiểu, X-Frame-Options, nosniff, Referrer-Policy) trong `next.config.ts`; cân nhắc bỏ SVG khỏi upload công khai.
- [ ] Trắc nghiệm: `/api/system/firebase-health` chỉ admin; thêm `import 'server-only'` cho `firebaseAdmin.ts`, `r2Storage.ts`, `verifyAuth.ts`, `examAccess.ts`, `examSourceStorage.ts`; thêm Zod cho các route nhận body; rate limit `send-result`.
- [ ] Chuyển file `*-firebase-adminsdk-*.json` ra ngoài thư mục dự án (git đã ignore, chưa bị lộ); cân nhắc xoay khóa nếu từng chia sẻ.
- [ ] Gia Sư: cân nhắc `sessionVersion` để thu hồi phiên; xác nhận MOD được `createTutorManually` có chủ ý.

## Quy trình bắt buộc cho mỗi lần build lớn và mỗi lần commit (người dùng yêu cầu 2026-11-04)
- Trước mỗi build lớn (xong một Bước, hoặc thay đổi nhiều file/route/rules) và trước mỗi commit: chạy skill `security-review` trên các thay đổi chưa commit. Đối chiếu thêm bộ quy tắc ở đầu file này (Auth → Zod → IDOR → Execute → Sanitized output, `server-only`, không lộ secret ra client).
- Sau đó chạy `npx tsc --noEmit` và `npm run build`. Chỉ báo "xong" khi có kết quả thật (dùng skill `superpowers:verification-before-completion`).
- Ghi kết quả security-review (phát hiện + cách xử lý) vào mục "Nhật ký" bên dưới, rồi mới commit.
- Áp dụng cho cả hai dự án (Trắc nghiệm và Gia Sư).

## Nhật ký thực hiện
- 2026-11-04 Bước 1 (code xong, CHƯA commit, CHƯA deploy rules):
  - Sửa `firestore.rules`, `src/app/api/submissions/route.ts`, `QuizClient.tsx`, `QuizPageClient.tsx`.
  - Kiểm tra: `npx tsc --noEmit` sạch; `npm run build` thành công; `firebase deploy --only firestore:rules --dry-run --project test-website-5779f` biên dịch rules thành công. Chưa thử hành vi rules bằng emulator (máy không có Java).
  - security-review: không có lỗ hổng độ tin cậy ≥8. Ghi nhận mức thấp: (1) trả `scores` khi gửi lại bài tự luận đã nộp (nên ẩn khi có `gradingStatus`, làm ở Bước 2); (2) hai lượt `start` song song có thể tạo 2 phiên IN_PROGRESS (cân nhắc transaction).
  - Còn dở: staff vẫn đọc được mọi `submissions` (mục "staff không đọc bài nộp của GV khác" chuyển sang Bước 2, vì cần chuyển các trang admin sang API). Cần thử rules bằng tài khoản thật (HS làm bài, admin duyệt GV) ngoài giờ thi rồi mới deploy; thứ tự: đưa code lên Vercel trước, deploy rules sau.

- 2026-11-04 Đợt sửa tự luận + bộ chuyển LaTeX (chưa commit): thêm `src/utils/latexNormalize.ts`; sửa `latexParser`, `textProcessor`, `tikzToImage`, `ReviewMode`, trang xem lại của giáo viên, trang kết quả, create/edit-exam. `tsc` sạch, `npm run build` thành công. Rà soát bảo mật thủ công: ảnh TikZ chỉ nhận `https://`, `/local-imports/` hoặc `data:image/(svg+xml|png);base64`; không dùng `dangerouslySetInnerHTML`; API essay vẫn do máy chủ kiểm quyền.

- 2026-11-04 Nhận dạng tự luận bằng `\dapso{}` + giáo viên đặt điểm từng câu (chưa commit): `smartParseLatex`/`parseLatexExam` coi khối có `\dapso` là tự luận khi bật Phần IV (đề 3 phần vẫn coi như `\shortans`); đáp số tự luận bị bỏ khỏi dữ liệu gửi học sinh ở `/api/exams/[id]/access` (còn đọc được qua Firestore trực tiếp cho tới Bước 2). `tsc`, eslint, `npm run build` đều sạch.

- 2026-11-04 Bước 2 (code xong, CHƯA commit, CHƯA deploy rules):
  - Mới: `src/lib/examAnswerKey.ts` (dựng câu hỏi, gỡ đáp án, bảng chi tiết email), `src/app/api/submissions/review/route.ts` (đáp án sau khi nộp). Sửa: `/access`, `/api/submissions`, `/api/send-result`, `QuizClient`, trang xem lại của học sinh, `examVersions`, `firestore.rules` (`exams` chỉ staff đọc).
  - `/access` cho học sinh: không còn đáp án, lời giải, `rawLatex`, `rawLatexSource`, `authorEmail`. `/api/submissions` chấm trên đúng bộ câu hỏi học sinh nhận. Client không chấm nữa, dùng `scores` của máy chủ. `send-result` chỉ nhận `submissionId`, tự dựng nội dung, mỗi bài gửi một lần (`resultEmailSentAt`).
  - security-review: 1 phát hiện mức vừa (nộp trắng rồi lấy đáp án khi đề còn mở). Đã xử lý: đề có `endTime` thì giữ đáp án đến khi đề đóng (423 `ANSWERS_NOT_RELEASED`); đề không có giờ đóng vẫn hiện sau khi nộp. Còn lại, đề không giờ đóng + nhiều lượt vẫn lộ đáp án cho lượt sau (chấp nhận, cần cờ "công bố đáp án" nếu muốn chặt hơn).
  - Kiểm tra: `tsc` sạch, eslint sạch trên file đã sửa, `npm run build` thành công (trước bản vá giữ đáp án). Chưa thử bằng tài khoản thật.
  - Chưa làm trong Bước 2: các trang admin/giáo viên vẫn đọc `submissions` trực tiếp qua Firestore nên staff vẫn đọc được bài nộp của giáo viên khác.

## Ghi chú vận hành
- Commit chỉ khi người dùng bảo; Gia Sư: dump DB trước migration, push main sau mỗi track (Vercel tự deploy).
- Làm từng bước, báo kết quả + bằng chứng trước khi sang bước sau.
