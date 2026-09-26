import { DOMParser, type Element as XmlElement, type Node as XmlNode } from "@xmldom/xmldom";
import { unzipSync } from "fflate";
import { parseLatexExam, type ParsedQuestion } from "@/utils/latexParser";

export interface ImportedExamFile {
  title: string;
  questions: ParsedQuestion[];
  latex: string;
  warnings: string[];
  stats: {
    questionCount: number;
    equationCount: number;
    imageCount: number;
    pageCount?: number;
  };
}

type AssetUploader = (input: {
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
}) => Promise<string | null>;

const IMAGE_TOKEN_RE = /\[\[EXAM_IMAGE:([^\]]+)\]\]/g;

function elementChildren(node: XmlNode): XmlElement[] {
  const result: XmlElement[] = [];
  for (let i = 0; i < node.childNodes.length; i += 1) {
    const child = node.childNodes.item(i);
    if (child?.nodeType === 1) result.push(child as XmlElement);
  }
  return result;
}

function localName(node: XmlNode): string {
  return node.localName || node.nodeName.split(":").pop() || node.nodeName;
}

function firstChild(node: XmlNode, name: string): XmlElement | null {
  return elementChildren(node).find((child) => localName(child) === name) ?? null;
}

function childrenNamed(node: XmlNode, name: string): XmlElement[] {
  return elementChildren(node).filter((child) => localName(child) === name);
}

function textContent(node: XmlNode | null): string {
  return node?.textContent ?? "";
}

function mathText(node: XmlNode | null): string {
  if (!node) return "";
  if (node.nodeType === 3) return node.nodeValue ?? "";
  if (node.nodeType !== 1) return "";

  const element = node as XmlElement;
  const name = localName(element);
  const content = (childName: string) => mathText(firstChild(element, childName));
  const all = () => elementChildren(element).map(mathText).join("");

  switch (name) {
    case "t":
      return textContent(element);
    case "r":
      return Array.from(element.getElementsByTagName("m:t"))
        .map((item) => item.textContent ?? "")
        .join("") || textContent(element);
    case "f":
      return `\\frac{${content("num")}}{${content("den")}}`;
    case "sSup":
      return `{${content("e")}}^{${content("sup")}}`;
    case "sSub":
      return `{${content("e")}}_{${content("sub")}}`;
    case "sSubSup":
      return `{${content("e")}}_{${content("sub")}}^{${content("sup")}}`;
    case "rad": {
      const degree = content("deg");
      return degree
        ? `\\sqrt[${degree}]{${content("e")}}`
        : `\\sqrt{${content("e")}}`;
    }
    case "d": {
      const properties = firstChild(element, "dPr");
      const begin = firstChild(properties ?? element, "begChr")?.getAttribute("m:val") ?? "(";
      const end = firstChild(properties ?? element, "endChr")?.getAttribute("m:val") ?? ")";
      return `\\left${begin}${childrenNamed(element, "e").map(mathText).join(",")}\\right${end}`;
    }
    case "nary": {
      const properties = firstChild(element, "naryPr");
      const symbol = firstChild(properties ?? element, "chr")?.getAttribute("m:val") ?? "∑";
      const commands: Record<string, string> = { "∑": "\\sum", "∏": "\\prod", "∫": "\\int", "⋃": "\\bigcup", "⋂": "\\bigcap" };
      return `${commands[symbol] ?? symbol}_{${content("sub")}}^{${content("sup")}} ${content("e")}`;
    }
    case "func":
      return `\\operatorname{${content("fName")}}\!\left(${content("e")}\right)`;
    case "acc": {
      const chr = firstChild(firstChild(element, "accPr") ?? element, "chr")?.getAttribute("m:val") ?? "^";
      const command = chr === "¯" ? "\\bar" : chr === "→" ? "\\vec" : "\\hat";
      return `${command}{${content("e")}}`;
    }
    case "bar":
      return `\\overline{${content("e")}}`;
    case "limLow":
      return `{${content("e")}}_{${content("lim")}}`;
    case "limUpp":
      return `{${content("e")}}^{${content("lim")}}`;
    case "m": {
      const rows = childrenNamed(element, "mr").map((row) =>
        childrenNamed(row, "e").map(mathText).join(" & "),
      );
      return `\\begin{pmatrix}${rows.join(" \\\\ ")}\\end{pmatrix}`;
    }
    case "eqArr":
      return `\\begin{aligned}${childrenNamed(element, "e").map(mathText).join(" \\\\ ")}\\end{aligned}`;
    case "oMath":
    case "oMathPara":
    case "e":
    case "num":
    case "den":
    case "sub":
    case "sup":
    case "deg":
    case "fName":
    case "lim":
      return all();
    default:
      return all();
  }
}

function contentTypeFor(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ({
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    emf: "image/emf",
    wmf: "image/wmf",
  } as Record<string, string>)[ext ?? ""] ?? "application/octet-stream";
}

function normalizeTarget(target: string): string {
  const clean = target.replace(/^\.\.\//, "").replace(/^\//, "");
  return clean.startsWith("word/") ? clean : `word/${clean}`;
}

function parseRelationships(xml: string): Map<string, string> {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const map = new Map<string, string>();
  const relationships = document.getElementsByTagName("Relationship");
  for (let i = 0; i < relationships.length; i += 1) {
    const item = relationships.item(i);
    const id = item?.getAttribute("Id");
    const target = item?.getAttribute("Target");
    if (id && target) map.set(id, normalizeTarget(target));
  }
  return map;
}

function parseQuestionBlocks(text: string, warnings: string[]): ParsedQuestion[] {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
  const marker = /^\s*Câu\s+(\d+)\s*[.:)]\s*/gim;
  const matches = Array.from(normalized.matchAll(marker));
  if (matches.length === 0) {
    warnings.push("Không tìm thấy tiêu đề dạng “Câu 1.”, “Câu 2.”… nên chưa thể tách câu hỏi tự động.");
    return [];
  }

  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? normalized.length;
    let block = normalized.slice(start, end).trim();

    const images = Array.from(block.matchAll(IMAGE_TOKEN_RE), (item) => item[1]);
    block = block.replace(IMAGE_TOKEN_RE, "").trim();

    const explanationMatch = /(?:^|\n)\s*(?:Lời giải|Giải)\s*:\s*([\s\S]*)$/i.exec(block);
    const explanation = explanationMatch?.[1]?.trim() ?? "";
    if (explanationMatch?.index !== undefined) block = block.slice(0, explanationMatch.index).trim();

    const answerMatch = /(?:^|\n)\s*(?:Đáp án|ĐA)\s*:\s*([^\n]+)/i.exec(block);
    const rawAnswer = answerMatch?.[1]?.trim() ?? "";
    if (answerMatch?.index !== undefined) {
      block = `${block.slice(0, answerMatch.index)}\n${block.slice(answerMatch.index + answerMatch[0].length)}`.trim();
    }

    const choiceMatches = Array.from(block.matchAll(/^\s*([A-D])\s*[.):]\s*(.+)$/gim));
    const statementMatches = Array.from(block.matchAll(/^\s*([a-d])\s*[.):]\s*(.+)$/gm));
    let type = "short_answer";
    let options: string[] | undefined;
    let correctAnswer: string | number | boolean[] = rawAnswer;
    let questionText = block;

    if (choiceMatches.length >= 2) {
      type = "multiple_choice";
      options = choiceMatches.map((item) => item[2].trim());
      questionText = block.slice(0, choiceMatches[0].index).trim();
      const letter = rawAnswer.match(/[A-D]/i)?.[0]?.toUpperCase();
      correctAnswer = letter ? letter.charCodeAt(0) - 65 : -1;
      if (!letter) warnings.push(`Câu ${index + 1}: chưa nhận diện được đáp án A/B/C/D.`);
    } else if (statementMatches.length >= 2) {
      type = "true_false";
      options = statementMatches.map((item) => item[2].trim());
      questionText = block.slice(0, statementMatches[0].index).trim();
      const keys = rawAnswer.toUpperCase().match(/[ĐDSSTF]/g) ?? [];
      correctAnswer = options.map((_, optionIndex) => ["Đ", "D", "T"].includes(keys[optionIndex] ?? ""));
      if (keys.length < options.length) warnings.push(`Câu ${index + 1}: đáp án Đúng/Sai chưa đủ ${options.length} ý.`);
    } else if (!rawAnswer) {
      warnings.push(`Câu ${index + 1}: chưa tìm thấy dòng “Đáp án: …”.`);
    }

    return {
      id: index + 1,
      type,
      questionText,
      ...(options ? { options } : {}),
      correctAnswer,
      explanation,
      ...(images.length > 0 ? { imageUrls: images } : {}),
    };
  });
}

function escapeLatexBlock(value: string): string {
  return value.replace(/\\examimage\{/g, "\\textbackslash{}examimage\\{");
}

export function questionsToLatex(questions: ParsedQuestion[]): string {
  return questions.map((question) => {
    const images = (question.imageUrls ?? []).map((url) => `\\examimage{${url}}`).join("\n");
    let answer = `\\shortans{${String(question.correctAnswer ?? "")}}`;
    if (question.type === "multiple_choice") {
      answer = `\\choice${(question.options ?? []).map((option, index) => `{${question.correctAnswer === index ? "\\True " : ""}${escapeLatexBlock(option)}}`).join("")}`;
    } else if (question.type === "true_false") {
      const correct = Array.isArray(question.correctAnswer) ? question.correctAnswer : [];
      answer = `\\choiceTF${(question.options ?? []).map((option, index) => `{${correct[index] ? "\\True " : ""}${escapeLatexBlock(option)}}`).join("")}`;
    }
    const explanation = question.explanation ? `\n\\loigiai{${escapeLatexBlock(question.explanation)}}` : "";
    return `\\begin{ex}\n${escapeLatexBlock(question.questionText)}\n${images}\n${answer}${explanation}\n\\end{ex}`;
  }).join("\n\n");
}

export async function importDocx(
  bytes: Uint8Array,
  fileName: string,
  uploadAsset?: AssetUploader,
): Promise<ImportedExamFile> {
  const warnings: string[] = [];
  const zip = unzipSync(bytes);
  const documentBytes = zip["word/document.xml"];
  if (!documentBytes) throw new Error("DOCX_INVALID");

  const decoder = new TextDecoder("utf-8");
  const relationshipsBytes = zip["word/_rels/document.xml.rels"];
  const relationships = relationshipsBytes
    ? parseRelationships(decoder.decode(relationshipsBytes))
    : new Map<string, string>();
  const imageUrls = new Map<string, string>();

  if (uploadAsset) {
    for (const [path, mediaBytes] of Object.entries(zip)) {
      if (!path.startsWith("word/media/")) continue;
      const mediaName = path.split("/").pop() ?? "image";
      const type = contentTypeFor(mediaName);
      if (["image/emf", "image/wmf"].includes(type)) {
        warnings.push(`Ảnh ${mediaName} là ${type.split("/")[1].toUpperCase()}; trình duyệt có thể không hiển thị, nên đổi sang SVG hoặc PNG.`);
      }
      const url = await uploadAsset({ bytes: mediaBytes, fileName: mediaName, contentType: type });
      if (url) imageUrls.set(path, url);
    }
  } else if (Object.keys(zip).some((path) => path.startsWith("word/media/"))) {
    warnings.push("Tài liệu có hình ảnh nhưng R2 public chưa sẵn sàng; ảnh chưa được đưa vào đề.");
  }

  const document = new DOMParser().parseFromString(decoder.decode(documentBytes), "application/xml");
  const paragraphs = document.getElementsByTagName("w:p");
  const lines: string[] = [];
  let equationCount = 0;
  let referencedImages = 0;

  const walkParagraph = (node: XmlNode): string => {
    if (node.nodeType === 3) return "";
    if (node.nodeType !== 1) return "";
    const element = node as XmlElement;
    const name = localName(element);
    if (name === "oMath" || name === "oMathPara") {
      equationCount += 1;
      const latex = mathText(element).trim();
      return latex ? `$${latex}$` : "";
    }
    if (name === "t") return textContent(element);
    if (name === "tab") return "\t";
    if (name === "br") return "\n";
    if (name === "blip") {
      const relationshipId = element.getAttribute("r:embed");
      const target = relationshipId ? relationships.get(relationshipId) : null;
      const url = target ? imageUrls.get(target) : null;
      if (url) {
        referencedImages += 1;
        return `\n[[EXAM_IMAGE:${url}]]\n`;
      }
      return "";
    }
    return elementChildren(element).map(walkParagraph).join("");
  };

  for (let i = 0; i < paragraphs.length; i += 1) {
    const line = walkParagraph(paragraphs.item(i)!).replace(/[ \t]+/g, " ").trim();
    if (line) lines.push(line);
  }

  if (Object.keys(zip).some((path) => path.startsWith("word/embeddings/"))) {
    warnings.push("Phát hiện đối tượng nhúng MathType/OLE. Định dạng OLE cũ không thể chuyển trực tiếp trên máy chủ; hãy đổi công thức sang Word Equation hoặc SVG trước khi nhập.");
  }

  const questions = parseQuestionBlocks(lines.join("\n"), warnings);
  return {
    title: fileName.replace(/\.docx$/i, ""),
    questions,
    latex: questionsToLatex(questions),
    warnings,
    stats: { questionCount: questions.length, equationCount, imageCount: referencedImages },
  };
}

export async function importPdf(bytes: Uint8Array, fileName: string): Promise<ImportedExamFile> {
  const warnings: string[] = [
    "PDF chỉ cung cấp lớp văn bản; công thức có bố cục phức tạp và hình vẽ cần được kiểm tra lại trong bản xem trước.",
  ];
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const rows = new Map<number, Array<{ x: number; text: string }>>();
    for (const rawItem of content.items) {
      if (!("str" in rawItem) || !("transform" in rawItem)) continue;
      const item = rawItem as { str: string; transform: number[] };
      const y = Math.round(item.transform[5]);
      const row = rows.get(y) ?? [];
      row.push({ x: item.transform[4], text: item.str });
      rows.set(y, row);
    }
    const lines = Array.from(rows.entries())
      .sort(([a], [b]) => b - a)
      .map(([, row]) => row.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    pages.push(lines.join("\n"));
  }

  const text = pages.join("\n");
  if (text.trim().length < 30) {
    warnings.push("PDF có rất ít văn bản có thể đọc; đây có thể là bản scan và cần OCR trước khi nhập.");
  }
  const questions = parseQuestionBlocks(text, warnings);
  return {
    title: fileName.replace(/\.pdf$/i, ""),
    questions,
    latex: questionsToLatex(questions),
    warnings,
    stats: { questionCount: questions.length, equationCount: 0, imageCount: 0, pageCount: pdf.numPages },
  };
}

export function extractExamLatex(source: string): { latex: string; blockCount: number } {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const withoutComments = normalized.replace(/(?<!\\)%[^\n]*/g, "");
  const blocks: string[] = [];
  const blockPattern = /\\begin\{(ex|bt)\}[\s\S]*?\\end\{\1\}/g;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(withoutComments)) !== null) {
    blocks.push(match[0].trim());
  }
  return { latex: blocks.join("\n\n"), blockCount: blocks.length };
}

export async function importTex(bytes: Uint8Array, fileName: string): Promise<ImportedExamFile> {
  const warnings: string[] = [];
  const source = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const extracted = extractExamLatex(source);
  if (extracted.blockCount === 0) {
    warnings.push("Không tìm thấy khối \\begin{ex}…\\end{ex} hoặc \\begin{bt}…\\end{bt} trong file TEX.");
  }
  const questions = extracted.latex
    ? parseLatexExam(extracted.latex).map((question, index) => ({ ...question, id: index + 1 }))
    : [];
  const unknownCount = questions.filter((question) => question.type === "essay").length;
  if (unknownCount > 0) {
    warnings.push(`${unknownCount} câu chưa có \\choice, \\choiceTF hoặc \\shortans nên cần bổ sung loại câu hỏi.`);
  }
  if (source.trim() && extracted.latex.length < source.trim().length) {
    warnings.push("Hệ thống đã lược bỏ phần khai báo gói lệnh, định dạng tài liệu và nội dung ngoài các khối câu hỏi.");
  }
  const equationCount = (extracted.latex.match(/\\(?:frac|sqrt|sum|prod|int|lim|vec|overline)\b|\$[^$]+\$/g) ?? []).length;
  return {
    title: fileName.replace(/\.tex$/i, ""),
    questions,
    latex: extracted.latex,
    warnings,
    stats: { questionCount: questions.length, equationCount, imageCount: 0 },
  };
}
