"use client";

import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

// 教练回复的 Markdown 渲染：GFM 表格/任务列表 + 单换行成段；
// 默认不透传原始 HTML，模型输出无法注入脚本
export function CoachMarkdown({ text }: { text: string }) {
  return (
    <div className="coach-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          a(props) {
            const { href, title, children } = props;
            return (
              <a href={href} title={title} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
