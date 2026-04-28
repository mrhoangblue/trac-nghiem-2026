export interface Answer {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  content: string;
  answers: Answer[];
  correctAnswerId: string;
}

export interface Quiz {
  id: string;
  title: string;
  description: string;
  questions: Question[];
}

export const quizzes: Quiz[] = [
  {
    id: "algebra-8-1",
    title: "Đại số 8: Phương trình và Đa thức",
    description: "Ôn tập kiến thức cơ bản về phân tích đa thức thành nhân tử và giải phương trình bậc nhất một ẩn.",
    questions: [
      {
        id: "q1",
        content: "Phân tích đa thức $x^2 - 4y^2$ thành nhân tử.",
        answers: [
          { id: "a1", text: "$(x - 2y)(x + 2y)$" },
          { id: "a2", text: "$(x - y)(x + 4y)$" },
          { id: "a3", text: "$(x - 2y)^2$" },
          { id: "a4", text: "$(x + 2y)^2$" },
        ],
        correctAnswerId: "a1",
      },
      {
        id: "q2",
        content: "Giải phương trình $2x - 4 = 0$.",
        answers: [
          { id: "a1", text: "$x = 2$" },
          { id: "a2", text: "$x = -2$" },
          { id: "a3", text: "$x = 4$" },
          { id: "a4", text: "$x = 0$" },
        ],
        correctAnswerId: "a1",
      },
      {
        id: "q3",
        content: "Kết quả của phép tính $(x + 3)^2$ là gì?",
        answers: [
          { id: "a1", text: "$x^2 + 9$" },
          { id: "a2", text: "$x^2 + 3x + 9$" },
          { id: "a3", text: "$x^2 + 6x + 9$" },
          { id: "a4", text: "$x^2 - 6x + 9$" },
        ],
        correctAnswerId: "a3",
      },
      {
        id: "q4",
        content: "Tìm $x$, biết: $x(x - 5) - x^2 + 10 = 0$.",
        answers: [
          { id: "a1", text: "$x = 5$" },
          { id: "a2", text: "$x = 2$" },
          { id: "a3", text: "$x = -2$" },
          { id: "a4", text: "$x = 10$" },
        ],
        correctAnswerId: "a2",
      }
    ],
  },
  {
    id: "geometry-8-1",
    title: "Hình học 8: Bài toán thực tế",
    description: "Ứng dụng hình học vào thực tiễn, tính toán diện tích và lượng vật liệu cần thiết.",
    questions: [
      {
        id: "q1",
        content: "Một miếng bìa hình chữ nhật có chiều dài $20 \\text{ cm}$ và chiều rộng $15 \\text{ cm}$. Người ta cắt đi 4 góc của miếng bìa 4 hình vuông bằng nhau có cạnh $x \\text{ cm}$. Diện tích phần bìa còn lại là bao nhiêu?",
        answers: [
          { id: "a1", text: "$(300 - 4x^2) \\text{ cm}^2$" },
          { id: "a2", text: "$(300 - x^2) \\text{ cm}^2$" },
          { id: "a3", text: "$(35 - 4x) \\text{ cm}^2$" },
          { id: "a4", text: "$(300 - 2x^2) \\text{ cm}^2$" },
        ],
        correctAnswerId: "a1",
      },
      {
        id: "q2",
        content: "Để lát nền một căn phòng hình chữ nhật có kích thước $4 \\text{ m} \\times 6 \\text{ m}$, người ta dùng các viên gạch hình vuông cạnh $50 \\text{ cm}$. Cần bao nhiêu viên gạch (bỏ qua hao hụt)?",
        answers: [
          { id: "a1", text: "$96 \\text{ viên}$" },
          { id: "a2", text: "$120 \\text{ viên}$" },
          { id: "a3", text: "$48 \\text{ viên}$" },
          { id: "a4", text: "$24 \\text{ viên}$" },
        ],
        correctAnswerId: "a1",
      }
    ],
  }
];
