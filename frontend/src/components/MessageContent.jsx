import { Fragment } from "react";


const HEADING_PATTERN = /^\s{0,3}#{1,6}\s+(.+?)\s*$/u;
const ORDERED_ITEM_PATTERN = /^\s*[0-9۰-۹]+[.)]\s+(.+?)\s*$/u;
const UNORDERED_ITEM_PATTERN = /^\s*[-*•]\s+(.+?)\s*$/u;
const STRONG_PATTERN = /(\*\*|__)(.+?)\1/gu;


function InlineContent({ children }) {
  const content = String(children ?? "");
  const nodes = [];
  let cursor = 0;

  for (const match of content.matchAll(STRONG_PATTERN)) {
    const start = match.index;
    if (start > cursor) {
      nodes.push(content.slice(cursor, start).replaceAll("**", ""));
    }
    nodes.push(<strong className="font-extrabold" key={`strong-${start}`}>{match[2]}</strong>);
    cursor = start + match[0].length;
  }

  if (cursor < content.length) {
    nodes.push(content.slice(cursor).replaceAll("**", ""));
  }

  return nodes.map((node, index) => <Fragment key={`inline-${index}`}>{node}</Fragment>);
}


function parseBlocks(content) {
  const blocks = [];
  let paragraphLines = [];

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    blocks.push({ type: "paragraph", content: paragraphLines.join("\n") });
    paragraphLines = [];
  };

  const appendListItem = (type, item) => {
    const previous = blocks.at(-1);
    if (previous?.type === type) {
      previous.items.push(item);
      return;
    }
    blocks.push({ type, items: [item] });
  };

  for (const line of String(content ?? "").replace(/\r\n?/gu, "\n").split("\n")) {
    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    const heading = line.match(HEADING_PATTERN);
    if (heading) {
      flushParagraph();
      blocks.push({ type: "heading", content: heading[1] });
      continue;
    }

    const unorderedItem = line.match(UNORDERED_ITEM_PATTERN);
    if (unorderedItem) {
      flushParagraph();
      appendListItem("unordered-list", unorderedItem[1]);
      continue;
    }

    const orderedItem = line.match(ORDERED_ITEM_PATTERN);
    if (orderedItem) {
      flushParagraph();
      appendListItem("ordered-list", orderedItem[1]);
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  return blocks;
}


export default function MessageContent({ content, formatted = false }) {
  if (!formatted) {
    return <p className="mixed-content whitespace-pre-wrap break-words text-[15px] leading-7 sm:text-base" dir="auto">{content}</p>;
  }

  return (
    <div className="assistant-message-content break-words text-right text-[15px] leading-7 sm:text-base" dir="rtl" lang="fa">
      {parseBlocks(content).map((block, blockIndex) => {
        if (block.type === "heading") {
          return <p className="font-extrabold" key={`block-${blockIndex}`}><InlineContent>{block.content}</InlineContent></p>;
        }
        if (block.type === "unordered-list" || block.type === "ordered-list") {
          const List = block.type === "ordered-list" ? "ol" : "ul";
          return (
            <List className="assistant-message-list" key={`block-${blockIndex}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`item-${itemIndex}`}><InlineContent>{item}</InlineContent></li>
              ))}
            </List>
          );
        }
        return (
          <p className="whitespace-pre-wrap" key={`block-${blockIndex}`}>
            <InlineContent>{block.content}</InlineContent>
          </p>
        );
      })}
    </div>
  );
}
