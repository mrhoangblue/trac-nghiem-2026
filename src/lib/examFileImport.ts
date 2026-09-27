import { DOMParser, type Document as XmlDocument, type Element as XmlElement, type Node as XmlNode } from "@xmldom/xmldom";
import { convertMetafileToDataUrl, convertMetafileToSvg, loadSystemFonts } from "emf-converter";
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
const INLINE_IMAGE_TOKEN = (url: string) => `[[EXAM_INLINE_IMAGE:${url}]]`;
let metafileFontsPromise: ReturnType<typeof loadSystemFonts> | null = null;

function getMetafileFonts() {
  metafileFontsPromise ??= loadSystemFonts({
    filter: (_path, name) => /times|stix|latin|symbol|serif|liberation|dejavu|cambria|noto/i.test(name),
  });
  return metafileFontsPromise;
}

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

function descendantsNamed(node: XmlNode, name: string): XmlElement[] {
  const result: XmlElement[] = [];
  const visit = (current: XmlNode) => {
    for (const child of elementChildren(current)) {
      if (localName(child) === name) result.push(child);
      visit(child);
    }
  };
  visit(node);
  return result;
}

function blueMathLatex(node: XmlNode): string | null {
  const candidates = [node, ...descendantsNamed(node, "docPr"), ...descendantsNamed(node, "cNvPr")];
  for (const candidate of candidates) {
    if (candidate.nodeType !== 1) continue;
    const element = candidate as XmlElement;
    for (let index = 0; index < element.attributes.length; index += 1) {
      const value = element.attributes.item(index)?.value ?? "";
      if (!value.startsWith("BlueMathLatex:")) continue;
      try {
        return Buffer.from(value.slice("BlueMathLatex:".length), "base64").toString("utf8").trim();
      } catch {
        return null;
      }
    }
  }
  return null;
}

function blueMathLatexFromAncestors(node: XmlNode): string | null {
  let current: XmlNode | null = node;
  while (current) {
    if (["inline", "anchor"].includes(localName(current))) {
      const latex = blueMathLatex(current);
      if (latex) return latex;
    }
    current = current.parentNode;
  }
  return null;
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
    tif: "image/tiff",
    tiff: "image/tiff",
    emf: "image/emf",
    wmf: "image/wmf",
  } as Record<string, string>)[ext ?? ""] ?? "application/octet-stream";
}

async function prepareOfficeAsset(
  bytes: Uint8Array,
  fileName: string,
): Promise<{ bytes: Uint8Array; fileName: string; contentType: string; convertedMetafile: boolean }> {
  const contentType = contentTypeFor(fileName);
  if (contentType !== "image/wmf" && contentType !== "image/emf") {
    return { bytes, fileName, contentType, convertedMetafile: false };
  }

  try {
    const arrayBuffer = Uint8Array.from(bytes).buffer;
    const fonts = await getMetafileFonts();
    const pngDataUrl = await convertMetafileToDataUrl(arrayBuffer, {
      fonts,
      dpiScale: 2,
      maxWidth: 1600,
      maxHeight: 800,
    });
    if (pngDataUrl) {
      return {
        bytes: Uint8Array.from(Buffer.from(pngDataUrl.slice(pngDataUrl.indexOf(",") + 1), "base64")),
        fileName: fileName.replace(/\.(?:wmf|emf)$/i, ".png"),
        contentType: "image/png",
        convertedMetafile: true,
      };
    }
    const svg = await convertMetafileToSvg(arrayBuffer, { includeSize: true });
    if (svg) {
      return {
        bytes: new TextEncoder().encode(svg),
        fileName: fileName.replace(/\.(?:wmf|emf)$/i, ".svg"),
        contentType: "image/svg+xml",
        convertedMetafile: true,
      };
    }
  } catch {
    // Keep the original asset and surface one grouped warning below.
  }
  return { bytes, fileName, contentType, convertedMetafile: false };
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
    block = block.replace(/\n\s*PHẦN\s+(?:I|II|III)\b[\s\S]*$/i, "").trim();

    const images = Array.from(block.matchAll(IMAGE_TOKEN_RE), (item) => item[1]);
    block = block.replace(IMAGE_TOKEN_RE, "").trim();

    const explanationMatch = /(?:^|\n)\s*(?:Lời giải|Giải)\s*:?[ \t]*\n?([\s\S]*)$/i.exec(block);
    const explanation = explanationMatch?.[1]?.trim() ?? "";
    if (explanationMatch?.index !== undefined) block = block.slice(0, explanationMatch.index).trim();

    const answerMatch = /(?:^|\n)\s*(?:Đáp án|ĐA)\s*:\s*([^\n]+)/i.exec(block);
    const rawAnswer = answerMatch?.[1]?.trim() ?? "";
    if (answerMatch?.index !== undefined) {
      block = `${block.slice(0, answerMatch.index)}\n${block.slice(answerMatch.index + answerMatch[0].length)}`.trim();
    }

    const choiceMarkers = Array.from(block.matchAll(/(?:^|\n|\s)([A-D])\s*(?:[.):]\s*|(?=\$))/g));
    const choiceMatches = choiceMarkers.map((item, itemIndex) => ({
      index: item.index ?? 0,
      value: block.slice((item.index ?? 0) + item[0].length, choiceMarkers[itemIndex + 1]?.index ?? block.length).trim(),
    }));
    const statementMatches = Array.from(block.matchAll(/(?:^|\n)\s*([a-d])\s*[.):]\s*([\s\S]*?)(?=(?:\n\s*[a-d]\s*[.):])|$)/g));
    let type = "short_answer";
    let options: string[] | undefined;
    let correctAnswer: string | number | boolean[] = rawAnswer;
    let questionText = block;

    if (choiceMatches.length >= 2) {
      type = "multiple_choice";
      options = choiceMatches.map((item) => item.value);
      questionText = block.slice(0, choiceMatches[0].index).trim();
      const letter = rawAnswer.match(/[A-D]/i)?.[0]?.toUpperCase();
      correctAnswer = letter ? letter.charCodeAt(0) - 65 : -1;
    } else if (statementMatches.length >= 2) {
      type = "true_false";
      options = statementMatches.map((item) => item[2].trim());
      questionText = block.slice(0, statementMatches[0].index).trim();
      const keys = rawAnswer.toUpperCase().match(/[ĐDSSTF]/g) ?? [];
      correctAnswer = options.map((_, optionIndex) => ["Đ", "D", "T"].includes(keys[optionIndex] ?? ""));
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

interface AnswerKey {
  multipleChoice: string[];
  trueFalse: boolean[][];
  shortAnswer: string[];
}

function cellText(cell: XmlElement): string {
  return descendantsNamed(cell, "t").map((item) => textContent(item)).join("").trim();
}

function extractAnswerKey(document: XmlDocument): AnswerKey {
  const key: AnswerKey = { multipleChoice: [], trueFalse: [], shortAnswer: [] };
  const standaloneTrueFalse: boolean[][] = [];
  const tables = document.getElementsByTagName("w:tbl");
  for (let tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
    const table = tables.item(tableIndex);
    if (!table) continue;
    const rows = descendantsNamed(table, "tr").map((row) => childrenNamed(row, "tc").map(cellText));
    const labeledAnswers = rows.flat().map((value) => value.match(/^\s*([a-d])\)\s*([ĐS])/i)).filter(Boolean);
    if (labeledAnswers.length === 4 && new Set(labeledAnswers.map((item) => item?.[1].toLowerCase())).size === 4) {
      standaloneTrueFalse.push(labeledAnswers.map((item) => item?.[2].toUpperCase() === "Đ"));
    }
    if (rows.length < 2) continue;
    if (rows[0]?.[0]?.trim().toLowerCase() === "câu" && rows[1]?.[0]?.trim().toLowerCase() === "chọn") {
      const answers = rows[1].slice(1).map((value) => value.trim()).filter(Boolean);
      if (answers.length >= 10 && answers.every((value) => /^[A-D]$/i.test(value))) {
        key.multipleChoice = answers.map((value) => value.toUpperCase());
      } else if (answers.length > 0) {
        key.shortAnswer = answers;
      }
      continue;
    }
    if (rows[0].length === 4 && rows[0].every((value) => /^Câu\s+\d+$/i.test(value))) {
      key.trueFalse = rows[0].map((_, column) => rows.slice(1).map((row) => {
        const answer = (row[column] ?? "").match(/[a-d]\)\s*([ĐS])/i)?.[1];
        return answer?.toUpperCase() === "Đ";
      }));
      continue;
    }
  }
  if (key.trueFalse.length === 0 && standaloneTrueFalse.length >= 4) key.trueFalse = standaloneTrueFalse.slice(0, 4);
  return key;
}

function extractHighlightedAnswerKey(solutionText: string): AnswerKey {
  const key: AnswerKey = { multipleChoice: [], trueFalse: [], shortAnswer: [] };
  const matches = Array.from(solutionText.matchAll(/^\s*Câu\s+(\d+)\s*[.:)]\s*/gim));
  const blocks = matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? solutionText.length;
    return solutionText.slice(start, end);
  });
  for (const block of blocks.slice(0, 12)) {
    const answer = block.match(/\[\[CORRECT:([A-D])\]\]/)?.[1];
    if (answer) key.multipleChoice.push(answer);
  }
  for (const block of blocks.slice(12, 16)) {
    const trueLabels = new Set(Array.from(block.matchAll(/\[\[TRUE:([a-d])\]\]/g), (item) => item[1]));
    if (trueLabels.size > 0) key.trueFalse.push(["a", "b", "c", "d"].map((label) => trueLabels.has(label)));
  }
  return key;
}

function mergeAnswerKeys(primary: AnswerKey, fallback: AnswerKey): AnswerKey {
  return {
    multipleChoice: primary.multipleChoice.length >= 12 ? primary.multipleChoice : fallback.multipleChoice,
    trueFalse: primary.trueFalse.length >= 4 ? primary.trueFalse : fallback.trueFalse,
    shortAnswer: primary.shortAnswer.length >= 6 ? primary.shortAnswer : fallback.shortAnswer,
  };
}

function applyAnswerKey(questions: ParsedQuestion[], key: AnswerKey): void {
  let multipleChoiceIndex = 0;
  let trueFalseIndex = 0;
  let shortAnswerIndex = 0;
  for (const question of questions) {
    if (question.type === "multiple_choice") {
      const answer = key.multipleChoice[multipleChoiceIndex++];
      if (answer) question.correctAnswer = answer.charCodeAt(0) - 65;
    } else if (question.type === "true_false") {
      const answer = key.trueFalse[trueFalseIndex++];
      if (answer) question.correctAnswer = answer;
    } else {
      const answer = key.shortAnswer[shortAnswerIndex++];
      if (answer) question.correctAnswer = answer;
    }
  }
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
  const document = new DOMParser().parseFromString(decoder.decode(documentBytes), "application/xml");
  const imageUrls = new Map<string, string>();
  const referencedAssetPaths = new Set<string>();

  const allElements = document.getElementsByTagName("*");
  for (let index = 0; index < allElements.length; index += 1) {
    const element = allElements.item(index);
    if (!element || blueMathLatexFromAncestors(element)) continue;
    const name = localName(element);
    if (name !== "blip" && name !== "imagedata") continue;
    const relationshipId = element.getAttribute("r:embed") || element.getAttribute("r:id");
    const target = relationshipId ? relationships.get(relationshipId) : null;
    if (target) referencedAssetPaths.add(target);
  }

  if (uploadAsset) {
    let legacyVectorCount = 0;
    let convertedMetafileCount = 0;
    for (const path of referencedAssetPaths) {
      const mediaBytes = zip[path];
      if (!mediaBytes) continue;
      const mediaName = path.split("/").pop() ?? "image";
      const prepared = await prepareOfficeAsset(mediaBytes, mediaName);
      if (prepared.convertedMetafile) convertedMetafileCount += 1;
      else if (["image/emf", "image/wmf"].includes(prepared.contentType)) legacyVectorCount += 1;
      const url = await uploadAsset(prepared);
      if (url) imageUrls.set(path, url);
    }
    if (convertedMetafileCount > 0) {
      warnings.push(`Đã chuyển ${convertedMetafileCount} ảnh xem trước WMF/EMF của Word và MathType sang PNG/SVG dùng được trên web.`);
    }
    if (legacyVectorCount > 0) {
      warnings.push(`${legacyVectorCount} hình minh họa là WMF/EMF; trình duyệt có thể không hiển thị, nên đổi sang SVG hoặc PNG.`);
    }
  } else if (referencedAssetPaths.size > 0) {
    warnings.push(`Tài liệu có ${referencedAssetPaths.size} hình minh họa nhưng chưa cấu hình nơi lưu; ảnh chưa được đưa vào đề.`);
  }

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
    if (name === "inline" || name === "anchor") {
      const latex = blueMathLatex(element);
      if (latex) {
        equationCount += 1;
        return `$${latex}$`;
      }
    }
    if (name === "object") {
      const preview = descendantsNamed(element, "imagedata")[0];
      const relationshipId = preview?.getAttribute("r:id");
      const target = relationshipId ? relationships.get(relationshipId) : null;
      const url = target ? imageUrls.get(target) : null;
      if (url) {
        referencedImages += 1;
        return INLINE_IMAGE_TOKEN(url);
      }
      return "";
    }
    if (name === "t") return textContent(element);
    if (name === "tab") return "\t";
    if (name === "br") return "\n";
    if (name === "blip" || name === "imagedata") {
      const relationshipId = element.getAttribute("r:embed") || element.getAttribute("r:id");
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

  const highlightedTokens = (paragraph: XmlElement): string => {
    const tokens: string[] = [];
    for (const highlight of descendantsNamed(paragraph, "highlight")) {
      const value = highlight.getAttribute("w:val") || highlight.getAttribute("val") || "";
      if (!value || value === "none") continue;
      let run: XmlNode | null = highlight.parentNode;
      while (run && localName(run) !== "r") run = run.parentNode;
      const label = run ? descendantsNamed(run, "t").map(textContent).join("").trim() : "";
      const upper = label.match(/\b([A-D])\b/)?.[1];
      const lower = label.match(/\b([a-d])\b/)?.[1];
      if (upper) tokens.push(`[[CORRECT:${upper}]]`);
      else if (lower) tokens.push(`[[TRUE:${lower}]]`);
    }
    return tokens.join(" ");
  };

  for (let i = 0; i < paragraphs.length; i += 1) {
    const paragraph = paragraphs.item(i)!;
    const tokens = highlightedTokens(paragraph);
    const line = `${walkParagraph(paragraph)} ${tokens}`.replace(/[ \t]+/g, " ").trim();
    if (line) lines.push(line);
  }

  const embeddedObjectCount = Object.keys(zip).filter((path) => path.startsWith("word/embeddings/")).length;
  if (embeddedObjectCount > 0) {
    equationCount += embeddedObjectCount;
    warnings.push(`Phát hiện ${embeddedObjectCount} đối tượng MathType/OLE; hệ thống giữ công thức bằng ảnh xem trước đúng vị trí thay vì chuyển MTEF sang LaTeX.`);
  }

  const fullText = lines.join("\n");
  const answerHeading = /^(?:PHẦN\s+II\s*:\s*)?ĐÁP ÁN\s*$/im.exec(fullText);
  const solutionHeading = /^(?:PHẦN\s+III\s*:\s*GIẢI\s+CHI\s+TIẾT|LỜI\s+GIẢI\s+CHI\s+TIẾT)\s*$/im.exec(fullText);
  const examEnd = Math.min(
    answerHeading?.index ?? Number.POSITIVE_INFINITY,
    solutionHeading?.index ?? Number.POSITIVE_INFINITY,
    fullText.length,
  );
  const examText = fullText.slice(0, examEnd).replace(/\[\[(?:CORRECT:[A-D]|TRUE:[a-d])\]\]/g, "");
  const solutionText = solutionHeading
    ? fullText.slice(solutionHeading.index + solutionHeading[0].length)
    : "";
  const cleanSolutionText = solutionText.replace(/\[\[(?:CORRECT:[A-D]|TRUE:[a-d])\]\]/g, "");
  const questions = parseQuestionBlocks(examText, warnings);
  const solutionWarnings: string[] = [];
  const solutionQuestions = cleanSolutionText ? parseQuestionBlocks(cleanSolutionText, solutionWarnings) : [];
  questions.forEach((question, index) => {
    const solution = solutionQuestions[index];
    if (solution?.explanation) question.explanation = solution.explanation;
  });

  const answerKey = mergeAnswerKeys(extractAnswerKey(document), extractHighlightedAnswerKey(solutionText));
  applyAnswerKey(questions, answerKey);

  let imageAnswerCount = 0;
  for (const question of questions) {
    if (question.type !== "short_answer" || String(question.correctAnswer ?? "").trim()) continue;
    const inlineImages = Array.from(
      question.explanation.matchAll(/\[\[EXAM_INLINE_IMAGE:([^\]]+)\]\]/g),
      (item) => item[1],
    );
    const explicitAnswer = /(?:Trả lời|Đáp số)\s*:?[ \t]*\[\[EXAM_INLINE_IMAGE:([^\]]+)\]\]/i.exec(question.explanation)?.[1];
    const answerImageUrl = explicitAnswer ?? inlineImages.at(-1);
    if (answerImageUrl) {
      question.correctAnswerImageUrl = answerImageUrl;
      question.requiresAnswerReview = true;
      imageAnswerCount += 1;
    }
  }

  const unresolvedMultipleChoice = questions.filter((question) => question.type === "multiple_choice" && question.correctAnswer === -1).length;
  const unresolvedTrueFalse = questions.filter((question) => question.type === "true_false" && (!Array.isArray(question.correctAnswer) || question.correctAnswer.length < (question.options?.length ?? 4))).length;
  const unresolvedShortAnswer = questions.filter((question) => question.type === "short_answer" && !String(question.correctAnswer ?? "").trim() && !question.correctAnswerImageUrl).length;
  if (unresolvedMultipleChoice > 0) warnings.push(`${unresolvedMultipleChoice} câu trắc nghiệm chưa nhận diện được đáp án.`);
  if (unresolvedTrueFalse > 0) warnings.push(`${unresolvedTrueFalse} câu đúng/sai chưa nhận diện đủ đáp án.`);
  if (unresolvedShortAnswer > 0) warnings.push(`${unresolvedShortAnswer} câu trả lời ngắn chưa nhận diện được đáp án.`);
  if (imageAnswerCount > 0) {
    warnings.push(`${imageAnswerCount} đáp án ngắn được giữ dưới dạng ảnh MathType; giáo viên cần nhập thêm giá trị chữ/số để hệ thống chấm tự động.`);
  }
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
