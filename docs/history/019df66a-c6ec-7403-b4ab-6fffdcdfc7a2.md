# Bản lưu nội dung phiên 019df66a-c6ec-7403-b4ab-6fffdcdfc7a2

Nguồn: Codex task ID `019df66a-c6ec-7403-b4ab-6fffdcdfc7a2`.

Tên nguồn: Không có title trong dữ liệu đọc tác vụ; nhận diện bằng ID.

Workspace nguồn: `/Users/hoangblue38/Desktop/website trac nghiem`.

Ngày tổng hợp: 2026-09-24. Đã đọc hết phân trang được API cung cấp (hasMore=false).

Đây là bản lưu các tin nhắn người dùng và trợ lý có thể truy xuất, theo thứ tự thời gian; không bao gồm suy luận nội bộ, tool output hay toàn bộ diff. Khẳng định kỹ thuật, tên mô hình, URL localhost và kết quả kiểm tra bên dưới thuộc thời điểm phiên cũ, không phải xác nhận hiện tại. Không dùng đề xuất cũ làm cấu hình triển khai trước khi kiểm chứng lại.

## Lượt 019df66b-37c0-74c3-ab43-2f9e734fca83

Trạng thái nguồn: completed. Thời điểm kết thúc (UTC): 2026-05-05T04:35:17.000Z.

### Người dùng

Act as a Senior Fullstack Next.js 14 and Firebase Developer. I need to build the "Data Drill-down" views for Teachers and fix the User Profile & Search logic.

CRITICAL RULE: Do NOT modify or break any existing exam grading logic (P1, P2, P3). Only add new routes, UI components, and Firebase fetch functions.

Execute the following 4 Tasks:

Task 1: Teacher Registration & Profile Management
- Update the Mod/Teacher Registration form to mandate a `phoneNumber` field.
- Create a new route: `/teacher/profile/page.tsx` (Dashboard for Teacher).
- Build a UI Form allowing the Teacher to update their `fullName` and `phoneNumber`.
- CRITICAL: Write a utility function `generateSearchKeywords(fullName, email, phoneNumber)`. It must strip diacritics (Vietnamese accents), convert to lowercase, and generate an array of substrings/words to save into the `searchKeywords` field in Firestore.

Task 2: Fix the "Find Teacher" Search Logic
- Update the Student's search bar component.
- The Firebase query MUST use: `where("searchKeywords", "array-contains", searchInput.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))` to successfully match the teacher.

Task 3: Class Details View (List Students)
- Create a dynamic route: `/teacher/classes/[classId]/page.tsx`.
- UI: Display the Class Name and Code.
- Firebase Logic: Fetch and render a DataGrid/Table of all `users` (Students) who have joined this specific `classId`. Clicking on a student's row should navigate to Task 4.

Task 4: Student Details View (List Submissions)
- Create a dynamic route: `/teacher/students/[studentId]/page.tsx`.
- Firebase Logic: Fetch all `submissions` belonging to this `studentId` ONLY for exams created by the `currentUser.uid` (the viewing teacher).
- UI: Render a Table showing the Exams this student has taken, their Attempts, Scores, and Submit Times. Clicking a specific submission must open the detailed review modal/page showing their exact P1, P2, P3 answers.

Output the complete code for the new `page.tsx` routes, the updated search query, and the `generateSearchKeywords` utility function. Ensure all UI is styled cleanly with Tailwind CSS.

Tôi đang build dở bên Claude thì hết token, hãy hỗ trợ tôi build bằng prompt này.
