# Hướng dẫn viết LaTeX khi soạn đề online (gửi cho AI biên soạn)

Cập nhật 16/11/2026. Tài liệu gồm 5 phần:

1. Quy tắc viết LaTeX để đề hiện đúng trên website (phần gửi cho AI biên soạn).
2. Danh sách tự kiểm trước khi giao file, có lệnh kiểm tự động.
3. Kết quả rà soát 13 đề ngày 16/11/2026 (các lỗi đã gặp).
4. Website đã sửa gì sau đợt rà soát.
5. Việc còn lại.

Phần 1 và 2 tự đủ nghĩa, có thể chép nguyên văn vào lời nhắc cho AI. Bản rút gọn cho Claude Code là skill `tao-de-online` (`~/.claude/skills/tao-de-online/SKILL.md`).

Mục tiêu khi soạn: lệnh `npm run check:latex` (mục 2) báo **ĐẠT**, tức mọi câu hiện đúng như nguồn và website không phải tự sửa chỗ nào.

---

## 1. Quy tắc viết (dành cho AI biên soạn)

Website không chạy LaTeX thật. Nó chỉ đọc một tập lệnh nhỏ rồi dựng công thức bằng KaTeX. Lệnh nằm ngoài tập này bị website đoán nghĩa hoặc bỏ đi, nên bản online có thể khác bản in. File biên dịch tốt bằng `ex_test` trên máy **không** bảo đảm hiện đúng trên web.

### 1.1. Khung một câu hỏi

```latex
\begin{ex}
  Nội dung câu hỏi có công thức $y = x^2$.
  \choice
  {$1$}
  {\True $2$}
  {$3$}
  {$4$}
  \loigiai{
    Lời giải.
  }
\end{ex}
```

| Dạng câu | Lệnh đáp án | Ghi chú |
| --- | --- | --- |
| Nhiều lựa chọn | `\choice{..}{..}{..}{..}` | Đúng 1 phương án có `\True` |
| Đúng/Sai | `\choiceTF{..}{..}{..}{..}` | Ý đúng có `\True`, ý sai để trống |
| Trả lời ngắn | `\shortans{12,5}` | Chỉ ghi giá trị, không ghi chữ |
| Tự luận | `\dapso{..}` (tuỳ chọn) | Điểm câu ghi bằng `\diem{1,0}` |

- Mỗi câu nằm trong một khối `\begin{ex}...\end{ex}` (hoặc `bt`), có đúng một `\loigiai{...}`.
- Hình vẽ: `\begin{tikzpicture}...\end{tikzpicture}` hoặc `\immini{chữ}{tikz}`. Mỗi câu tối đa một hình ở đề và một hình ở lời giải.
- Lời giải câu Đúng/Sai chia theo ý:

```latex
\loigiai{
  \begin{itemchoice}
    \itemch Đúng. Vì ...
    \itemch Sai. Vì ... \textbf{Sửa lại:} Diện tích tam giác $ABC$ bằng $\sqrt{17}$.
    \itemch ...
    \itemch ...
  \end{itemchoice}
}
```

- Thang chấm câu tự luận viết trong `\loigiai` bằng `\buoc{điểm}{nội dung}` (điểm đứng trước):

```latex
\loigiai{
  \buoc{0,25}{a) $\sin\left(x + \dfrac{\pi}{4}\right) = \dfrac{\sqrt{2}}{2}$.}
  \buoc{0,25}{$\hoac{&x = k2\pi\\&x = \dfrac{\pi}{2} + k2\pi}$ $(k\in\mathbb{Z})$.}
}
```

### 1.2. Công thức phải nằm trong dấu toán

Chỉ có 4 cách mở công thức: `$...$`, `$$...$$`, `\(...\)`, `\[...\]`. Mọi thứ nằm ngoài 4 cặp này là chữ thường.

| Viết chưa chuẩn | Viết đúng |
| --- | --- |
| `\begin{align*} a &= 1\\ &= 2 \end{align*}` | `\[\begin{aligned} a &= 1\\ &= 2 \end{aligned}\]` |
| `\begin{eqnarray*}...\end{eqnarray*}` | `\[\begin{aligned}...\end{aligned}\]` |
| `\begin{gather*}...\end{gather*}` đứng trần | `\[\begin{gather*}...\end{gather*}\]` |
| `\begin{equation}...\end{equation}` | `\[...\]` |

Không dùng `align`, `align*`, `eqnarray`, `equation`, `multline` ở ngoài dấu toán. Nhiều dòng căn theo dấu `=` thì luôn dùng `aligned` đặt trong `\[...\]`.

### 1.3. Hệ và tuyển: `\heva`, `\hoac`

Hai lệnh này chỉ được đặt trong **một dấu `$` đơn**, website tự tách thành dòng riêng.

| Viết sai | Viết đúng |
| --- | --- |
| `\[\hoac{&x=1\\&x=2}\]` | `$\hoac{&x=1\\&x=2}$` |
| `$$\heva{&x=1\\&y=2}$$` | `$\heva{&x=1\\&y=2}$` |
| `\[A \iff \heva{...}\]` | `$A \iff \heva{...}$` |

Không đặt `\heva`, `\hoac` trong `\[...\]` hay `$$...$$`. Nếu cần hệ nằm trong công thức hiển thị dài, dùng dạng chuẩn:

```latex
\[\left\{\begin{aligned}&x = 1\\&y = 2\end{aligned}\right.\]
\[\left[\begin{aligned}&x = 1\\&x = 2\end{aligned}\right.\]
```

### 1.4. Chữ đậm, chữ nghiêng

Chỉ có `\textbf{...}`, `\textit{...}`, `\emph{...}`, và bên trong chỉ chứa chữ thường.

| Viết sai | Viết đúng |
| --- | --- |
| `\textbf{\textit{Sửa lại:}} ...` | `\textbf{Sửa lại:} ...` |
| `\textit{Bước 1: tính $\dfrac{a}{b}$.}` | `\textit{Bước 1:} tính $\dfrac{a}{b}$.` |
| `{\bf đậm}`, `{\it nghiêng}` | `\textbf{đậm}`, `\textit{nghiêng}` |
| `\underline{...}`, `\uline{...}` | bỏ, hoặc dùng `\textbf{...}` |
| `\textcolor{red}{...}` ngoài công thức | bỏ màu |

Quy tắc ngắn: không lồng hai lệnh định dạng vào nhau; không để công thức có ngoặc nhọn `{}` nằm trong `\textbf`/`\textit`. Đưa công thức ra ngoài lệnh định dạng.

### 1.5. Không dùng lệnh tự định nghĩa

Website không đọc phần khai báo đầu file, nên mọi `\newcommand` của người soạn đều vô nghĩa. Viết thẳng nội dung ra.

| Lệnh riêng đã gặp | Thay bằng |
| --- | --- |
| `\SuaLai{nội dung}` | `\textbf{Sửa lại:} nội dung` |
| `\RSb{nội dung}{0,25}` | `\buoc{0,25}{nội dung}` (đảo thứ tự: điểm đứng trước) |
| `\nh{40}{45}` | `$[40;45)$` |
| `\Bang{5}{...}` | bảng `tabular` đầy đủ (mục 1.6) |
| `\vv{AB}` | `\overrightarrow{AB}` |
| `\wideparen{AB}`, `\overarc{AB}` | `\overset{\frown}{AB}` |
| `\mbox{chữ}` trong công thức | `\text{chữ}` |
| `\ref`, `\label`, `\footnote` | bỏ |

Lệnh riêng duy nhất được phép: `\heva`, `\hoac`, `\True`, `\choice`, `\choiceTF`, `\shortans`, `\dapso`, `\diem`, `\buoc`, `\loigiai`, `\immini`, `\itemch`, `\indam`, và các môi trường `ex`, `bt`, `itemchoice`, `listEX`, `enumEX`, `itemEX`.

### 1.6. Bảng

Dùng `tabular` chuẩn. Mỗi ô có công thức thì bọc `$...$` riêng.

```latex
\begin{center}
\begin{tabular}{|l|c|c|c|}
\hline
\textbf{Nhóm} & $[40;45)$ & $[45;50)$ & $[50;55)$ \\ \hline
\textbf{Tần số} & $5$ & $12$ & $15$ \\ \hline
\end{tabular}
\end{center}
```

Không dùng `tabularx`, `longtable`, `multirow`, `multicolumn`, `tabvar`. Bảng biến thiên vẽ bằng TikZ.

### 1.7. Danh sách và xuống dòng

- Được dùng: `itemize`, `enumerate`, `\item`, `\item[a)]`, `listEX`, `enumEX`.
- Xuống dòng trong lời giải: `\\` hoặc để một dòng trống. Không viết `\\[2mm]`.
- Ba chấm ngoài công thức: `\dots` hoặc `…`. Không viết `\dots{}` (hiện thừa `{}`).
- Các lệnh dàn trang (`\vspace`, `\hfill`, `\noindent`, `\centering`, `\small`, `\par`) bị bỏ qua, nên không dựa vào chúng để trình bày.

### 1.8. Lệnh toán dùng an toàn

Đã kiểm tra hiện đúng: `\dfrac`, `\sqrt`, `\left( \right)`, `\vec`, `\overrightarrow`, `\widehat`, `\lim\limits`, `\int\limits`, `\sum`, `\displaystyle`, `\mathbb`, `\mathscr`, `\mathrm`, `\text{...}` (có dấu tiếng Việt), `\iff`, `\implies`, `\Rightarrow`, `\Leftrightarrow`, `\ne`, `\le`, `\ge`, `\in`, `\notin`, `\subset`, `\cap`, `\cup`, `\setminus`, `\forall`, `\perp`, `\parallel`, `\circ`, `\approx`, `\pm`, `\cdot`, `\times`, `\infty`, `\begin{aligned}`, `\begin{cases}`, `\begin{array}`, số thập phân `1{,}5`, phần trăm `6\%`.

Chữ tiếng Việt trong công thức luôn đặt trong `\text{...}`, ví dụ `$v = 25\text{ (mét/phút)}$`.

---

## 2. Tự kiểm trước khi giao file

### 2.1. Kiểm tự động (ưu tiên)

Khi làm việc trên máy có thư mục dự án website, chạy:

```bash
cd "$HOME/Documents/WORKSPACE/1_Projects/website trac nghiem"
npm run check:latex -- "/đường/dẫn/đề-online.tex"
```

Lệnh này dùng đúng bộ tách đề và bộ hiển thị của website. Kết quả `ĐẠT` nghĩa là mọi câu hiện đúng như nguồn. Mỗi dòng `LỖI` hoặc `TỰ SỬA` ghi số câu, vị trí (đề bài, phương án, lời giải) và đoạn mã liên quan; sửa hết rồi chạy lại cho tới khi `ĐẠT`.

- `LỖI`: học sinh sẽ thấy nội dung sai hoặc thiếu (công thức không dựng được, dấu `$` lẻ, ngoặc nhọn lệch). Website không cho lưu đề còn lỗi loại này.
- `TỰ SỬA`: website đoán được ý và hiện tạm ổn, nhưng nguồn viết chưa chuẩn.

### 2.2. Kiểm bằng tay (khi không chạy được lệnh trên)

Chạy lần lượt 8 phép tìm sau trên file `.tex`. Mỗi phép phải cho **0 kết quả**.

| # | Tìm (biểu thức chính quy) | Nếu còn thì sửa theo |
| --- | --- | --- |
| 1 | `\\begin\{(align\*?|eqnarray\*?|equation\*?|multline\*?)\}` | mục 1.2 |
| 2 | `(\\\[|\$\$)[^$]*?\\(heva|hoac)\{` | mục 1.3 |
| 3 | `\\text(bf|it)\{\s*\\text(bf|it)\{` | mục 1.4 |
| 4 | `\\(textbf|textit|emph)\{[^{}]*\$[^$]*[{}][^$]*\$` | mục 1.4 |
| 5 | `\\(SuaLai|RSb|nh|Bang|vv|mbox|underline|uline|textcolor|wideparen|overarc|ref|label|footnote)\b` | mục 1.5 |
| 6 | `\\(newcommand|renewcommand|def)\b` (trừ `\renewcommand{\arraystretch}`) | mục 1.5 |
| 7 | `\\(l?dots)\{\}` | mục 1.7 |
| 8 | `\\begin\{(tabularx|longtable|tabvar)\}|\\multi(row|column)` | mục 1.6 |

Kiểm thêm bằng mắt:

- Số dấu `$` trong mỗi câu là số chẵn; mỗi `\[` có một `\]`.
- Mỗi `\choice`/`\choiceTF` có đúng 4 nhóm `{...}`; câu nhiều lựa chọn có đúng một `\True`.
- Câu Đúng/Sai có đủ 4 `\itemch` trong lời giải, đúng thứ tự a, b, c, d.
- Câu tự luận: tổng điểm các `\buoc` bằng `\diem` của câu.
- Mọi lệnh bắt đầu bằng `\` nằm ngoài dấu toán đều thuộc danh sách cho phép ở mục 1.5, 1.6, 1.7.

Sau khi dán đề lên web, ô soạn đề hiện ngay bảng "LaTeX của n câu hiển thị đúng" hoặc danh sách câu chưa chuẩn kèm nút **Nhờ AI sửa**. Trang **Đề của tôi → Xem đề** cũng gắn nhãn "LaTeX chưa chuẩn" vào từng câu và đếm vào mục "Cần kiểm tra".

---

## 3. Kết quả rà soát ngày 16/11/2026 (trước khi sửa bộ hiển thị)

Rà bằng tài khoản giáo viên `nv.hoang@royal.edu.vn`, mở trang **Xem đề** của cả 13 đề và tìm mọi đoạn mã LaTeX hiện ra dạng chữ thô. Chỉ đọc, không sửa dữ liệu.

Kết quả: 6 đề có lỗi hiển thị, 7 đề sạch. Không có công thức nào làm KaTeX báo lỗi; toàn bộ lỗi do lệnh nằm ngoài tập website hỗ trợ.

| Đề | Lớp | Lỗi | Vị trí |
| --- | --- | --- | --- |
| Đề ôn tập kiểm tra cuối HK1 Số 02 (08/11) | 12 | `\textbf{\textit{Sửa lại:}}` ×6 | LG câu 13, 14, 15 (3 chỗ), 16 |
| | | `\begin{align*}` ngoài dấu toán ×4 | LG câu 17, 20 (2 khối), 22 |
| Đề ôn tập kiểm tra giữa HK1 - Đề số 01 (31/10) | 12 | `\SuaLai{...}` ×6 | LG câu 13 (2), 14, 15 (2), 16 |
| | | `\hoac` đặt trong `\[...\]` ×1 | LG câu 21 |
| Kiểm tra giữa HK1 - Lần 2 - NA (04/11) | 11 | `\Bang{5}{...}` ×2 | Đề câu 12, 16 |
| | | `\nh{a}{b}` | Câu 12 (đề, 4 phương án, LG), LG câu 16 |
| | | `\SuaLai{...}` ×3 | LG câu 13, 14 (2) |
| | | `\RSb{...}{0,25}` ×12 | LG câu 19, 20, 21, 22 |
| | | `\dots{}` ×1 | LG câu 16 |
| Kiểm tra Giữa HK1 - NA (01/11) | 11 | `\Bang` ×2, `\nh`, `\SuaLai` ×3, `\RSb` ×12, `\dots{}` ×2 | Câu 12, 13, 14, 16, 19–22 |
| Đề KSCL Lần 3 - K11 (11/10) | 11 | `\textit{Bước 1: tính $...$.}` ×2 | LG câu 20 |

Đề sạch: KSCL Lần 5 - NC1, KSCL Lần 4 - K12, KSCL Lần 3 - K12, KSCL Lần 2 - K11, KSCL Lần 1 - K11, KSCL Số 2 - K12 Royal, Khảo sát chất lượng Lần 1, [TOÁN 12] Bài kiểm tra kết thúc Chương I.

Hai đề K11 "NA" còn một hệ quả khác: vì dùng `\RSb` thay cho `\buoc`, câu tự luận 19–22 chưa có thang chấm từng ý, nên chấm nháp bằng AI không có ý nào để đối chiếu.

Sau khi sửa bộ hiển thị (mục 4), cả 6 đề trên đã hiện đúng mà không phải sửa nguồn. Riêng thang chấm của hai đề K11 "NA" chỉ có khi lưu lại đề (xem mục 5).

### Quy trình sửa nguồn một đề đang có (không bắt buộc)

1. Vào **Đề của tôi → Sửa**, chép toàn bộ mã nguồn ra một file `.tex` để giữ bản gốc.
2. Thay theo bảng dưới, đúng thứ tự từ trên xuống.
3. Chạy 8 phép tìm ở mục 2 cho tới khi đều ra 0.
4. Dán lại vào ô mã nguồn, bấm xem trước, đọc lướt lời giải các câu đã sửa.
5. Lưu, rồi mở **Xem đề** kiểm lần cuối.

Chỉ sửa chữ trong lời giải và bảng. Không đổi thứ tự câu, không đổi đáp án, vì đề đã có học sinh nộp bài.

| Bước | Tìm | Thay bằng |
| --- | --- | --- |
| 1 | `\textbf{\textit{Sửa lại:}}` | `\textbf{Sửa lại:}` |
| 2 | `\SuaLai{X}` | `\textbf{Sửa lại:} X` |
| 3 | `\begin{align*}` … `\end{align*}` | `\[\begin{aligned}` … `\end{aligned}\]` |
| 4 | `\[` + `\hoac{...}` + `\]` | `$\hoac{...}$` |
| 5 | `\RSb{X}{0,25}` | `\buoc{0,25}{X}` |
| 6 | `\nh{a}{b}` | `$[a;b)$` |
| 7 | `\Bang{5}{dòng 1 \\\hline dòng 2}` | `tabular` 6 cột như mục 1.6 |
| 8 | `\dots{}` | `\dots` |
| 9 | `\textit{Bước 1: tính $...$.}` | `\textit{Bước 1:} tính $...$.` |

---

## 4. Website đã sửa gì (16/11/2026)

Nguyên tắc mới của bộ hiển thị: **không đoạn mã LaTeX nào được hiện nguyên dạng cho người đọc**. Mọi nơi hiện nội dung đề (làm bài, xem lại, kiểm duyệt, soạn đề, chấm tự luận) đều đi qua một bộ dựng duy nhất, `processLatexText` trong `src/utils/textProcessor.tsx`.

| Lớp | Việc làm | File |
| --- | --- | --- |
| 1. Chuẩn hoá nguồn | `\SuaLai`, `\RSb`, `\Bang`, `\nh`, `{\bf …}` đổi sang cấu trúc chuẩn; `align*`, `eqnarray*`, `gather*`, `equation` đứng ngoài dấu toán thành công thức hiển thị; `\dots{}` không còn thừa `{}` | `src/utils/latexNormalize.ts` |
| 2. Dựng chữ | Đọc từng lệnh có ngoặc cân bằng: `\textbf`, `\textit`, `\underline` lồng nhau và chứa công thức đều được. `\hoac`, `\heva` dựng đúng ở mọi vị trí. Bảng nhận `\multicolumn`, ô chứa hệ phương trình | `src/utils/textProcessor.tsx` |
| 3. Lưới an toàn phần chữ | Lệnh toán viết ngoài `$…$` (`\Rightarrow`, `\dfrac{1}{2}`) được dựng bằng KaTeX. Lệnh không nhận ra thì bỏ tên lệnh, giữ nội dung. Ngoặc nhọn gom nhóm và dấu `$` lẻ không in ra | `src/utils/textProcessor.tsx` |
| 4. Lưới an toàn công thức | Công thức KaTeX báo lỗi được tự sửa: bỏ lệnh lạ, đổi môi trường, bù ngoặc, bù `\left`/`\right`. Không cứu được thì hiện dạng chữ đọc được, không hiện mã | `src/utils/textProcessor.tsx` |
| 5. Cảnh báo | Mọi chỗ lớp 3 và 4 phải can thiệp đều được ghi lại và báo cho giáo viên ở ô soạn đề và trang kiểm duyệt. Đề còn công thức không dựng được thì không lưu được | `src/utils/latexLint.ts`, `src/components/exam-editor/LatexCheckPanel.tsx` |
| 6. Nhờ AI sửa | Nút **Nhờ AI sửa** gửi các câu chưa chuẩn cho Gemini viết lại. Bản sửa chỉ được nhận khi hiển thị sạch và không đổi đáp án, số liệu, số phương án, dạng câu; giáo viên có nút hoàn tác | `src/lib/aiLatexRepair.ts`, `src/utils/latexRepairCheck.ts`, `/api/exams/latex-repair` |

Lớp 1 và 2 chạy im lặng vì kết quả đúng hẳn ý người soạn. Lớp 3 và 4 là đoán, nên luôn kèm cảnh báo.

Công cụ kiểm:

| Lệnh | Việc làm |
| --- | --- |
| `npm test` | Bộ kiểm thử, gồm đúng các lỗi ở mục 3 (`tests/latexRender.test.ts`) |
| `npm run check:latex -- file.tex` | Rà một hay nhiều file `.tex` trước khi dán lên web |
| `npm run audit:latex` | Chép (chỉ đọc) mọi đề đang lưu trong Firestore rồi dựng thử toàn bộ; trượt nếu còn mã LaTeX lọt ra |

Kết quả `audit:latex` ngày 16/11/2026: 18 đề, 396 câu, 2.160 trường nội dung, không trường nào lọt mã LaTeX và không chỗ nào phải dùng tới lớp 3, 4.

Cấu hình AI: `GEMINI_API_KEY` (dùng chung với chấm tự luận), mô hình sửa LaTeX đặt bằng `AI_LATEX_MODEL`, mặc định `gemini-3.5-flash`.

---

## 5. Việc còn lại

- Hai đề K11 "NA" (01/11 và 04/11): vào **Sửa**, bấm phân tích rồi lưu lại để các `\RSb` thành thang chấm `\buoc` cho câu 19–22. Hiện lời giải đã hiện đúng (mỗi ý kèm số điểm) nhưng chưa có thang chấm từng ý cho chấm AI.
- Quy tắc ở mục 1 vẫn áp dụng cho AI biên soạn. Website tự sửa được nhiều kiểu viết lệch, nhưng file đạt chuẩn thì bản in và bản online giống nhau, và không phụ thuộc vào việc website đoán đúng.
- Lệnh riêng mới của người soạn (ngoài `\SuaLai`, `\RSb`, `\Bang`, `\nh`) sẽ bị bỏ tên, giữ nội dung và báo "TỰ SỬA". Nếu một lệnh riêng dùng thường xuyên, thêm nó vào `expandAuthorMacros` trong `src/utils/latexNormalize.ts` kèm một ca kiểm thử.
