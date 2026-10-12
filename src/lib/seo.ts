export const SITE_URL = "https://toanthayhoang.bluemath.app";
export const GRADE_PAGES = [
  { slug: "lop-10", grade: "Lớp 10", title: "Luyện tập Toán lớp 10", description: "Ôn tập Toán lớp 10 cùng Thầy Hoàng Blue: luyện các dạng câu hỏi, xem lời giải và theo dõi kết quả học tập." },
  { slug: "lop-11", grade: "Lớp 11", title: "Luyện tập Toán lớp 11", description: "Củng cố kiến thức Toán lớp 11, luyện đề kiểm tra và xem lại lời giải cùng Thầy Hoàng Blue." },
  { slug: "lop-12", grade: "Lớp 12", title: "Luyện tập Toán lớp 12", description: "Ôn tập Toán lớp 12 theo chương, luyện đề kiểm tra và theo dõi tiến bộ cùng Thầy Hoàng Blue." },
  { slug: "thi-thu-tot-nghiep-thpt", grade: "Thi Thử TN THPT", title: "Thi thử tốt nghiệp THPT môn Toán", description: "Luyện đề thi thử tốt nghiệp THPT môn Toán: trắc nghiệm, đúng sai và trả lời ngắn cùng Thầy Hoàng Blue." },
] as const;
export function gradeHref(grade: string) {
  const page = GRADE_PAGES.find((item) => item.grade === grade);
  return page ? `/de-thi/${page.slug}` : `/?grade=${encodeURIComponent(grade)}`;
}
