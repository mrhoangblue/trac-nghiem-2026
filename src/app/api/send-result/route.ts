import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuestionResult {
  number: number;
  part: "P1" | "P2" | "P3";
  isCorrect: boolean;
  /** P1: "A"/"B"/"C"/"D" hoặc "—"  |  P2: chuỗi Đ/S/- ví dụ "ĐS-Đ"  |  P3: số học sinh nhập */
  studentAnswer: string;
  /** P1: "A"/"B"/"C"/"D"  |  P2: chuỗi Đ/S ví dụ "ĐSSS"  |  P3: đáp án đúng (có thể có LaTeX) */
  correctAnswer: string;
  partialHits?: number; // P2 only: số ý đúng (0-4)
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

// ── Bảng điểm P2 ─────────────────────────────────────────────────────────────
const P2_TABLE = [0, 0.1, 0.25, 0.5, 1.0];

// ── Utility helpers ───────────────────────────────────────────────────────────

/** Escape HTML entities — luôn nhận string, không bao giờ throw */
function escapeHtml(str: unknown): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Làm sạch đáp án P3 trước khi đưa vào email.
 * "$5{,}3$" → "5,3"  |  "$1201$" → "1201"
 */
function cleanP3Answer(raw: string): string {
  return String(raw ?? "")
    .replace(/\$/g, "")
    .replace(/\{,\}/g, ",")
    .trim();
}

/**
 * Sinh HTML 3 dòng cho ô kết quả P2 trong email.
 *
 * Không dùng icon ✅/❌. Ba dòng bắt buộc:
 *   Dòng 1 — Kết quả: X/4 ý đúng  (Yđ)
 *   Dòng 2 — Bạn trả lời: ĐS-Đ    (monospace; "-" nếu ý chưa chọn)
 *   Dòng 3 — Đáp án: ĐSSS          (monospace xanh)
 *
 * @param hits        Số ý đúng (0-4), lấy từ partialHits
 * @param studentDS   Chuỗi Đ/S/- của học sinh, ví dụ "ĐS-Đ"
 * @param correctDS   Chuỗi Đ/S đúng của đề, ví dụ "ĐSSS"
 */
function formatP2Email(hits: number, studentDS: string, correctDS: string): string {
  const score     = P2_TABLE[hits] ?? 0;
  const hitsColor = hits === 4 ? "#15803d" : hits > 0 ? "#b45309" : "#dc2626";

  // Nếu học sinh chưa trả lời câu nào thì hiện "----"
  const displayStudent =
    studentDS && studentDS !== "—" && studentDS.trim() !== ""
      ? studentDS
      : "----";

  // Đáp án đúng luôn là chuỗi Đ/S, không bao giờ rỗng
  const displayCorrect = correctDS && correctDS !== "—" ? correctDS : "????";

  return `
<div style="line-height:2;font-size:13px;color:#374151;">
  <div>
    Kết quả:&nbsp;
    <strong style="color:${hitsColor};">${hits}/4 ý đúng</strong>
    <span style="color:#9ca3af;font-size:11px;margin-left:4px;">(${score}đ)</span>
  </div>
  <div>
    Bạn trả lời:&nbsp;
    <strong style="font-family:monospace;letter-spacing:3px;font-size:14px;color:#374151;">${escapeHtml(displayStudent)}</strong>
  </div>
  <div>
    Đáp án:&nbsp;
    <strong style="font-family:monospace;letter-spacing:3px;font-size:14px;color:#15803d;">${escapeHtml(displayCorrect)}</strong>
  </div>
</div>`;
}

// ── SMTP Transporter ──────────────────────────────────────────────────────────

function createTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Gmail App Password
    },
  });
}

// ── HTML Email Template ───────────────────────────────────────────────────────

function buildHtml(payload: SendResultPayload): string {
  const { studentName, examName, scores, detailedResults, submissionId } = payload;

  const scoreColor =
    scores.total >= 8 ? "#16a34a" : scores.total >= 5 ? "#d97706" : "#dc2626";
  const siteName = "Hệ thống Ôn tập Toán";
  const siteUrl   = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const reviewUrl = submissionId
    ? `${siteUrl}/student/review/${submissionId}`
    : `${siteUrl}/student/history`;

  // ── Phân loại câu hỏi theo phần ────────────────────────────────────────────
  const p1Rows = detailedResults.filter((r) => r.part === "P1");
  const p2Rows = detailedResults.filter((r) => r.part === "P2");
  const p3Rows = detailedResults.filter((r) => r.part === "P3");

  // ── Render row cho P1 và P3 (bố cục 5 cột) ─────────────────────────────────
  // Cột 1: Câu | Cột 2: Phần | Cột 3: Kết quả | Cột 4: Bạn trả lời | Cột 5: Đáp án đúng
  const renderP1P3Row = (r: QuestionResult): string => {
    const bg         = r.isCorrect ? "#f0fdf4" : "#fff7f7";
    const icon       = r.isCorrect ? "✅" : "❌";
    const labelColor = r.isCorrect ? "#15803d" : "#dc2626";

    // Cột "Bạn trả lời":
    // • P1: chữ cái "A"/"B"/"C"/"D" hoặc "—" nếu chưa chọn
    // • P3: số học sinh nhập hoặc "-" nếu bỏ trống
    const rawStudent = r.studentAnswer ?? "";
    const studentCell =
      rawStudent === "" || rawStudent === "—"
        ? `<span style="color:#9ca3af;font-size:13px;">—</span>`
        : `<span style="font-weight:700;font-size:14px;">${escapeHtml(rawStudent)}</span>`;

    // Cột "Đáp án đúng":
    // • P1: chữ cái "A"/"B"/"C"/"D" (đậm xanh)
    // • P3: đáp án sau khi strip LaTeX (đậm xanh)
    const rawCorrect  = r.part === "P3" ? cleanP3Answer(r.correctAnswer) : (r.correctAnswer ?? "");
    const correctCell =
      rawCorrect === "" || rawCorrect === "—"
        ? `<span style="color:#9ca3af;font-size:13px;">—</span>`
        : `<span style="color:#15803d;font-weight:700;font-size:14px;">${escapeHtml(rawCorrect)}</span>`;

    return `
<tr style="background:${bg};">
  <td style="padding:10px 14px;font-weight:700;color:#374151;border-bottom:1px solid #f3f4f6;text-align:center;">${r.number}</td>
  <td style="padding:10px 14px;border-bottom:1px solid #f3f4f6;text-align:center;">
    <span style="background:#e0e7ff;color:#4338ca;font-weight:700;font-size:11px;padding:2px 8px;border-radius:999px;">${r.part}</span>
  </td>
  <td style="padding:10px 14px;border-bottom:1px solid #f3f4f6;text-align:center;">
    ${icon}&nbsp;<span style="color:${labelColor};font-weight:600;">${r.isCorrect ? "Đúng" : "Sai"}</span>
  </td>
  <td style="padding:10px 14px;border-bottom:1px solid #f3f4f6;text-align:center;">${studentCell}</td>
  <td style="padding:10px 14px;border-bottom:1px solid #f3f4f6;text-align:center;">${correctCell}</td>
</tr>`;
  };

  // ── Render row cho P2 (cột Kết quả span 3 cột, KHÔNG dùng icon ✅/❌) ───────
  // P2 dùng colspan=3 để gộp cột "Kết quả" + "Bạn trả lời" + "Đáp án đúng"
  // thành 1 ô duy nhất hiển thị 3 dòng theo đúng yêu cầu.
  const renderP2Row = (r: QuestionResult): string => {
    // Màu nền: xanh nhạt nếu đúng tất cả, vàng nhạt nếu đúng một phần, đỏ nhạt nếu sai hết
    const hits = r.partialHits ?? 0;
    const bg   = hits === 4 ? "#f0fdf4" : hits > 0 ? "#fffbeb" : "#fff7f7";

    return `
<tr style="background:${bg};">
  <td style="padding:10px 14px;font-weight:700;color:#374151;border-bottom:1px solid #f3f4f6;text-align:center;">${r.number}</td>
  <td style="padding:10px 14px;border-bottom:1px solid #f3f4f6;text-align:center;">
    <span style="background:#fef3c7;color:#b45309;font-weight:700;font-size:11px;padding:2px 8px;border-radius:999px;">${r.part}</span>
  </td>
  <td colspan="3" style="padding:12px 16px;border-bottom:1px solid #f3f4f6;">
    ${formatP2Email(hits, r.studentAnswer, r.correctAnswer)}
  </td>
</tr>`;
  };

  // ── Ghép tất cả rows theo thứ tự P1 → P2 → P3 ─────────────────────────────
  const allRows = [
    ...p1Rows.map(renderP1P3Row),
    ...p2Rows.map(renderP2Row),
    ...p3Rows.map(renderP1P3Row),
  ].join("");

  const correctCount = detailedResults.filter((r) => r.isCorrect).length;
  const total        = detailedResults.length;

  const tableHeader = `
<tr style="background:#f9fafb;">
  <th style="padding:10px 14px;text-align:center;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e5e7eb;white-space:nowrap;">Câu</th>
  <th style="padding:10px 14px;text-align:center;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e5e7eb;white-space:nowrap;">Phần</th>
  <th style="padding:10px 14px;text-align:center;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e5e7eb;white-space:nowrap;">Kết quả</th>
  <th style="padding:10px 14px;text-align:center;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e5e7eb;white-space:nowrap;">Bạn trả lời</th>
  <th style="padding:10px 14px;text-align:center;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e5e7eb;white-space:nowrap;">Đáp án đúng</th>
</tr>`;

  // ── Full HTML ───────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kết quả bài thi</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- ── Header ──────────────────────────────────────────────── -->
        <tr>
          <td style="background:linear-gradient(135deg,#1d4ed8 0%,#4f46e5 100%);border-radius:16px 16px 0 0;padding:40px 40px 32px;text-align:center;">
            <div style="width:56px;height:56px;background:rgba(255,255,255,.2);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:16px;">📝</div>
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;line-height:1.3;">
              Kết quả bài thi
            </h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,.8);font-size:15px;font-weight:500;">
              ${escapeHtml(examName)}
            </p>
          </td>
        </tr>

        <!-- ── Greeting ────────────────────────────────────────────── -->
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

        <!-- ── Score summary ────────────────────────────────────────── -->
        <tr>
          <td style="background:#fff;padding:0 40px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <!-- Total score -->
                <td width="40%" style="padding-right:12px;vertical-align:top;">
                  <div style="background:#f0f9ff;border:2px solid #bae6fd;border-radius:14px;padding:20px;text-align:center;">
                    <div style="font-size:13px;color:#0284c7;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">Tổng điểm</div>
                    <div style="font-size:48px;font-weight:900;color:${scoreColor};line-height:1;">${scores.total}</div>
                    <div style="font-size:14px;color:#94a3b8;margin-top:2px;">/10 điểm</div>
                  </div>
                </td>
                <!-- Part breakdown -->
                <td width="60%" style="vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
                    <tr>
                      <td style="background:#ede9fe;padding:14px 16px;border-bottom:1px solid #e5e7eb;">
                        <div style="font-size:12px;color:#7c3aed;font-weight:700;text-transform:uppercase;">Phần 1 — Trắc nghiệm</div>
                        <div style="font-size:22px;font-weight:800;color:#5b21b6;margin-top:2px;">${scores.p1}<span style="font-size:13px;font-weight:500;color:#a78bfa;"> đ</span></div>
                      </td>
                    </tr>
                    <tr>
                      <td style="background:#fffbeb;padding:14px 16px;border-bottom:1px solid #e5e7eb;">
                        <div style="font-size:12px;color:#b45309;font-weight:700;text-transform:uppercase;">Phần 2 — Đúng/Sai</div>
                        <div style="font-size:22px;font-weight:800;color:#92400e;margin-top:2px;">${scores.p2}<span style="font-size:13px;font-weight:500;color:#fbbf24;"> đ</span></div>
                      </td>
                    </tr>
                    <tr>
                      <td style="background:#f0fdf4;padding:14px 16px;">
                        <div style="font-size:12px;color:#15803d;font-weight:700;text-transform:uppercase;">Phần 3 — Trả lời ngắn</div>
                        <div style="font-size:22px;font-weight:800;color:#14532d;margin-top:2px;">${scores.p3}<span style="font-size:13px;font-weight:500;color:#4ade80;"> đ</span></div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Quick stat -->
            <p style="margin:18px 0 0;text-align:center;color:#6b7280;font-size:13px;">
              Trả lời đúng <strong style="color:#1d4ed8;">${correctCount}/${total}</strong> câu hỏi
            </p>
          </td>
        </tr>

        <!-- ── Divider ──────────────────────────────────────────────── -->
        <tr>
          <td style="background:#fff;padding:0 40px;">
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;" />
          </td>
        </tr>

        <!-- ── Detailed results ─────────────────────────────────────── -->
        <tr>
          <td style="background:#fff;padding:28px 40px 32px;">
            <h2 style="margin:0 0 16px;font-size:16px;font-weight:800;color:#111827;">
              Chi tiết từng câu
            </h2>
            <div style="border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${tableHeader}
                ${allRows}
              </table>
            </div>
          </td>
        </tr>

        <!-- ── Ghi chú định dạng P2 ────────────────────────────────── -->
        <tr>
          <td style="background:#fff;padding:0 40px 24px;">
            <p style="margin:0;font-size:12px;color:#9ca3af;font-style:italic;">
              * Phần II: Đ = Đúng, S = Sai, - = Chưa trả lời.
              Ví dụ: ĐS-Đ nghĩa là ý a chọn Đúng, ý b chọn Sai, ý c bỏ trống, ý d chọn Đúng.
            </p>
          </td>
        </tr>

        <!-- ── CTA ─────────────────────────────────────────────────── -->
        <tr>
          <td style="background:#fff;padding:0 40px 40px;text-align:center;">
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:24px;">
              <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
                Muốn xem <strong>lời giải chi tiết từng câu</strong>?<br/>
                Đăng nhập vào hệ thống để xem lại bài làm của bạn.
              </p>
              <a href="${reviewUrl}"
                style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#4f46e5);color:#fff;font-weight:700;font-size:15px;text-decoration:none;padding:14px 36px;border-radius:12px;">
                Xem lời giải chi tiết →
              </a>
            </div>
          </td>
        </tr>

        <!-- ── Footer ──────────────────────────────────────────────── -->
        <tr>
          <td style="background:#f8fafc;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:13px;color:#9ca3af;">
              Email này được gửi tự động từ <strong style="color:#1d4ed8;">${siteName}</strong>.<br/>
              Vui lòng không trả lời email này.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body: SendResultPayload = await req.json();

    const { studentEmail, studentName, examName, scores, detailedResults } = body;

    if (!studentEmail || !examName) {
      return NextResponse.json({ error: "Thiếu trường bắt buộc." }, { status: 400 });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn("EMAIL_USER / EMAIL_PASS chưa được cấu hình trong .env.local");
      return NextResponse.json(
        { error: "Server chưa cấu hình email. Vui lòng liên hệ quản trị viên." },
        { status: 503 }
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

    console.log(
      `[send-result] Email sent to ${studentEmail} | exam=${examName} | total=${scores.total}`
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[send-result] Error:", err);
    return NextResponse.json(
      { error: "Gửi email thất bại. Vui lòng thử lại." },
      { status: 500 }
    );
  }
}
