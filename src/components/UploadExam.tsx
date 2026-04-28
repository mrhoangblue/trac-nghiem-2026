"use client";

import { useState } from 'react';
import { parseLatexExam, ParsedQuestion } from '@/utils/latexParser';

export default function UploadExam() {
  const [latex, setLatex] = useState('');
  const [result, setResult] = useState<ParsedQuestion[] | null>(null);

  const handleParse = () => {
    try {
      const parsed = parseLatexExam(latex);
      setResult(parsed);
    } catch (error) {
      console.error("Lỗi khi phân tích LaTeX:", error);
      alert("Đã có lỗi xảy ra khi phân tích mã LaTeX. Vui lòng kiểm tra lại cấu trúc file.");
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 w-full">
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 md:p-10">
        <h2 className="text-3xl font-extrabold text-gray-900 mb-6 tracking-tight">
          Upload Đề LaTeX (ex-test)
        </h2>
        
        <p className="text-gray-600 mb-6">
          Dán mã LaTeX sử dụng gói lệnh <code>ex-test</code> vào ô bên dưới để chuyển đổi thành cấu trúc dữ liệu JSON.
        </p>

        <textarea
          className="w-full h-80 p-5 border-2 border-gray-200 rounded-2xl mb-6 font-mono text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all resize-y"
          placeholder="\begin{ex}
  Nội dung câu hỏi ở đây...
  \choice
  {\True Đáp án A}
  {Đáp án B}
  {Đáp án C}
  {Đáp án D}
  \loigiai{
    Lời giải chi tiết...
  }
\end{ex}"
          value={latex}
          onChange={(e) => setLatex(e.target.value)}
          spellCheck={false}
        />
        
        <button
          onClick={handleParse}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-xl shadow-sm transition-all hover:shadow hover:-translate-y-0.5"
        >
          Phân tích đề
        </button>

        {result && (
          <div className="mt-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">
                Kết quả phân tích JSON:
              </h3>
              <span className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                {result.length} câu hỏi
              </span>
            </div>
            <pre className="bg-gray-900 text-gray-100 p-6 rounded-2xl overflow-x-auto text-sm font-mono leading-relaxed max-h-[600px] overflow-y-auto shadow-inner">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
