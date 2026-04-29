import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

// ── Types ─────────────────────────────────────────────────────────────────────

type P2Key = "a" | "b" | "c" | "d";
type P2AnswerValue = boolean | null | undefined;
type P2AnswerObject = Partial<Record<P2Key, P2AnswerValue>>;
type EmailAnswer = string | number | boolean | null | undefined | P2AnswerObject | P2AnswerValue[];

interface QuestionResult {
  number: number;
  part: "P1" | "P2" | "P3";
  isCorrect: boolean;
  studentAnswer: EmailAnswer;
  correctAnswer: EmailAnswer;
  partialHits?: number;
}

interface SendResultPayload {
  studentEmail: string;
  studentName: string;
  examName: string;
  submissionId?: string;
  scores: {
    p1: number;
    p2: number;
    p3: number;
    total: number;
  };
  detailedResults: QuestionResult[];
}

// ── Answer formatters ─────────────────────────────────────────────────────────

const cleanP3Answer = (ans: EmailAnswer): string => {
  if (typeof ans !== "string") return stringifyAnswer(ans);
  return ans.replace(/\$/g, "").replace(/\{,\}/g, ",");
};

const getP2String = (ansObj: EmailAnswer): string => {
  if (!ansObj) return "----";

  if (Array.isArray(ansObj)) {
    return ansObj
      .slice(0, 4)
      .map((value) => {
        if (value === true) return "Đ";
        if (value === false) return "S";
        return "-";
      })
      .join("")
      .padEnd(4, "-");
  }

  if (typeof ansObj === "object") {
    const answer = ansObj as P2AnswerObject;
    return (["a", "b", "c", "d"] as const)
      .map((opt) => {
        if (answer[opt] === true) return "Đ";
        if (answer[opt] === false) return "S";
        return "-";
      })
      .join("");
  }

  // Legacy payloads that already contain a compact answer such as "ĐS-Đ".
  if (typeof ansObj === "string" && /^[ĐS-]{1,4}$/u.test(ansObj)) {
    return ansObj.padEnd(4, "-");
  }

  return "----";
};

function stringifyAnswer(value: EmailAnswer): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "—";
}

function escapeHtml(value: EmailAnswer): string {
  return stringifyAnswer(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── SMTP Transporter ──────────────────────────────────────────────────────────

function createTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

// ── HTML Email Template ───────────────────────────────────────────────────────

function buildResultCells(row: QuestionResult): {
  result: string;
  studentAnswer: string;
  correctAnswer: string;
} {
  if (row.part === "P2") {
    return {
      result: `${row.partialHits ?? 0}/4 ý đúng`,
      studentAnswer: getP2String(row.studentAnswer),
      correctAnswer: getP2String(row.correctAnswer),
    };
  }

  if (row.part === "P3") {
    return {
      result: row.isCorrect ? "Đúng" : "Sai",
      studentAnswer: cleanP3Answer(row.studentAnswer),
      correctAnswer: cleanP3Answer(row.correctAnswer),
    };
  }

  return {
    result: row.isCorrect ? "Đúng" : "Sai",
    studentAnswer: stringifyAnswer(row.studentAnswer),
    correctAnswer: stringifyAnswer(row.correctAnswer),
  };
}

function renderResultRow(row: QuestionResult): string {
  const cells = buildResultCells(row);
  const bg = row.isCorrect ? "#f0fdf4" : "#fff7f7";
  const resultColor = row.isCorrect ? "#15803d" : "#dc2626";

  return `
    <tr style="background:${bg};">
      <td style="padding:10px 12px;font-weight:700;color:#374151;border-bottom:1px solid #f3f4f6;text-align:center;white-space:nowrap;">
        ${row.number}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:center;white-space:nowrap;">
        <span style="background:#e0e7ff;color:#4338ca;font-weight:700;font-size:11px;padding:2px 8px;border-radius:999px;">
          ${row.part}
        </span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:center;color:${resultColor};font-weight:700;white-space:nowrap;">
        ${escapeHtml(cells.result)}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#374151;text-align:center;white-space:nowrap;">
        ${escapeHtml(cells.studentAnswer)}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#166534;font-weight:700;text-align:center;white-space:nowrap;">
        ${escapeHtml(cells.correctAnswer)}
      </td>
    </tr>`;
}

function buildHtml(payload: SendResultPayload): string {
  const { studentName, examName, scores, detailedResults, submissionId } = payload;

  const scoreColor = scores.total >= 8 ? "#16a34a" : scores.total >= 5 ? "#d97706" : "#dc2626";
  const siteName = "Hệ thống Ôn tập Toán";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const reviewUrl = submissionId
    ? `${siteUrl}/student/review/${submissionId}`
    : `${siteUrl}/student/history`;
  const correctCount = detailedResults.filter((row) => row.isCorrect).length;
  const total = detailedResults.length;
  const resultRows = detailedResults.map(renderResultRow).join("");

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kết quả bài thi</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background:linear-gradient(135deg,#1d4ed8 0%,#4f46e5 100%);border-radius:16px 16px 0 0;padding:40px 40px 32px;text-align:center;">
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;line-height:1.3;">Kết quả bài thi</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,.85);font-size:15px;font-weight:500;">${escapeHtml(examName)}</p>
            </td>
          </tr>

          <tr>
            <td style="background:#fff;padding:32px 40px 24px;">
              <p style="margin:0;color:#374151;font-size:16px;line-height:1.6;">
                Xin chào <strong>${escapeHtml(studentName)}</strong>,
              </p>
              <p style="margin:8px 0 0;color:#6b7280;font-size:14px;line-height:1.7;">
                Bài thi của bạn đã được chấm. Dưới đây là kết quả chi tiết.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#fff;padding:0 40px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="40%" style="padding-right:12px;vertical-align:top;">
                    <div style="background:#f0f9ff;border:2px solid #bae6fd;border-radius:14px;padding:20px;text-align:center;">
                      <div style="font-size:13px;color:#0284c7;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">Tổng điểm</div>
                      <div style="font-size:48px;font-weight:900;color:${scoreColor};line-height:1;">${scores.total}</div>
                      <div style="font-size:14px;color:#94a3b8;margin-top:2px;">/10 điểm</div>
                    </div>
                  </td>
                  <td width="60%" style="vertical-align:top;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
                      <tr>
                        <td style="background:#ede9fe;padding:14px 16px;border-bottom:1px solid #e5e7eb;">
                          <div style="font-size:12px;color:#7c3aed;font-weight:700;text-transform:uppercase;">Phần 1 - Trắc nghiệm</div>
                          <div style="font-size:22px;font-weight:800;color:#5b21b6;margin-top:2px;">${scores.p1}<span style="font-size:13px;font-weight:500;color:#a78bfa;"> đ</span></div>
                        </td>
                      </tr>
                      <tr>
                        <td style="background:#fffbeb;padding:14px 16px;border-bottom:1px solid #e5e7eb;">
                          <div style="font-size:12px;color:#b45309;font-weight:700;text-transform:uppercase;">Phần 2 - Đúng/Sai</div>
                          <div style="font-size:22px;font-weight:800;color:#92400e;margin-top:2px;">${scores.p2}<span style="font-size:13px;font-weight:500;color:#fbbf24;"> đ</span></div>
                        </td>
                      </tr>
                      <tr>
                        <td style="background:#f0fdf4;padding:14px 16px;">
                          <div style="font-size:12px;color:#15803d;font-weight:700;text-transform:uppercase;">Phần 3 - Trả lời ngắn</div>
                          <div style="font-size:22px;font-weight:800;color:#14532d;margin-top:2px;">${scores.p3}<span style="font-size:13px;font-weight:500;color:#4ade80;"> đ</span></div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0;text-align:center;color:#6b7280;font-size:13px;">
                Trả lời đúng <strong style="color:#1d4ed8;">${correctCount}/${total}</strong> câu hỏi
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#fff;padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;" />
            </td>
          </tr>

          <tr>
            <td style="background:#fff;padding:28px 40px 32px;">
              <h2 style="margin:0 0 16px;font-size:16px;font-weight:800;color:#111827;">Chi tiết từng câu</h2>
              <div style="border-radius:12px;overflow-x:auto;border:1px solid #e5e7eb;">
                <table width="100%" cellpadding="0" cellspacing="0" style="min-width:560px;border-collapse:collapse;">
                  <thead>
                    <tr style="background:#f9fafb;">
                      <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e5e7eb;white-space:nowrap;">Câu</th>
                      <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e5e7eb;white-space:nowrap;">Phần</th>
                      <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e5e7eb;white-space:nowrap;">Kết quả</th>
                      <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e5e7eb;white-space:nowrap;">Bạn trả lời</th>
                      <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e5e7eb;white-space:nowrap;">Đáp án đúng</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${resultRows}
                  </tbody>
                </table>
              </div>
            </td>
          </tr>

          <tr>
            <td style="background:#fff;padding:0 40px 40px;text-align:center;">
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:24px;">
                <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
                  Muốn xem <strong>lời giải chi tiết từng câu</strong>?<br/>
                  Đăng nhập vào hệ thống để xem lại bài làm của bạn.
                </p>
                <a href="${reviewUrl}" style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#4f46e5);color:#fff;font-weight:700;font-size:15px;text-decoration:none;padding:14px 36px;border-radius:12px;">
                  Xem lời giải chi tiết
                </a>
              </div>
            </td>
          </tr>

          <tr>
            <td style="background:#f8fafc;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:13px;color:#9ca3af;">
                Email này được gửi tự động từ <strong style="color:#1d4ed8;">${siteName}</strong>.<br/>
                Vui lòng không trả lời email này.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body: SendResultPayload = await req.json();
    const { studentEmail, examName, scores } = body;

    if (!studentEmail || !examName) {
      return NextResponse.json({ error: "Thiếu trường bắt buộc." }, { status: 400 });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn("EMAIL_USER / EMAIL_PASS chưa được cấu hình trong .env.local");
      return NextResponse.json(
        { error: "Server chưa cấu hình email. Vui lòng liên hệ quản trị viên." },
        { status: 503 },
      );
    }

    const transporter = createTransporter();
    const html = buildHtml(body);

    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME ?? "Hệ thống Ôn tập Toán"}" <${process.env.EMAIL_USER}>`,
      to: studentEmail,
      subject: `Kết quả bài thi: ${examName}`,
      html,
    });

    console.log(`[send-result] Email sent to ${studentEmail} | exam=${examName} | total=${scores.total}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[send-result] Error:", err);
    return NextResponse.json(
      { error: "Gửi email thất bại. Vui lòng thử lại." },
      { status: 500 },
    );
  }
}
