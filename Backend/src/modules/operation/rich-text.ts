import sanitizeHtml from "sanitize-html";
import { AppError } from "../../lib/http.js";

const colorPattern = /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i;

/**
 * 清洗后台 Tiptap 生成的文档 HTML。
 * 仅保留 APP 富文本组件明确支持的排版标签、链接、颜色和图片。
 */
export function sanitizeDocumentContent(content: string) {
  const clean = sanitizeHtml(content, {
    allowedTags: [
      "p", "br", "h1", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "strike",
      "ul", "ol", "li", "blockquote", "code", "pre", "hr", "a", "img", "span",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "class"],
      "*": ["style"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowedStyles: {
      "*": {
        color: [colorPattern],
        "background-color": [colorPattern],
        "text-align": [/^(?:left|center|right|justify)$/],
      },
    },
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: { ...attribs, rel: "noopener noreferrer" },
      }),
    },
  }).trim();

  const plainText = sanitizeHtml(clean, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;|\s/gi, "")
    .trim();
  if (!plainText && !/<img\b/i.test(clean)) {
    throw new AppError(422, 3310, "文档内容不能为空");
  }
  return clean;
}
