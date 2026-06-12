import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { C, F, R } from "../../tokens";
import ChatBubble from "../ui/ChatBubble";
import Spinner from "../ui/Spinner";
import { useApp } from "../../context/AppContext";
import type { Message } from "../../types";

interface Props {
  onSend?: (msg: string) => Promise<void>;
  loading?: boolean;
  streamingContent?: string;
  decisionSlot?: React.ReactNode;
}

// Simple markdown renderer — handles bold, italic, inline code, headings, line breaks
function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: "4px" }} />;

        // Heading
        if (line.startsWith("# "))  return <div key={i} style={{ fontWeight: 700, fontSize: "14px", color: C.white, fontFamily: F.body, marginTop: "4px" }}>{parseInline(line.slice(2))}</div>;
        if (line.startsWith("## ")) return <div key={i} style={{ fontWeight: 700, fontSize: "13px", color: C.white, fontFamily: F.body, marginTop: "2px" }}>{parseInline(line.slice(3))}</div>;

        return <div key={i} style={{ fontFamily: F.body, fontSize: "13px", lineHeight: 1.6, color: C.textSec }}>{parseInline(line)}</div>;
      })}
    </div>
  );
}

function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Regex to match **bold**, *italic*, `code`
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1]) parts.push(<strong key={match.index} style={{ color: C.white, fontWeight: 600 }}>{match[1]}</strong>);
    else if (match[2]) parts.push(<em key={match.index} style={{ color: C.textSec }}>{match[2]}</em>);
    else if (match[3]) parts.push(<code key={match.index} style={{ fontFamily: F.mono, fontSize: "12px", color: C.mint, background: `${C.mint}12`, padding: "1px 5px", borderRadius: "3px" }}>{match[3]}</code>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function ChatPanel({ onSend, loading, streamingContent, decisionSlot }: Props) {
  const { state, dispatch } = useApp();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages, loading, streamingContent]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    setInput("");
    await onSend?.(trimmed);
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg }}>
      {/* Clear chats */}
      {state.messages.length > 0 && (
        <div style={{ flexShrink: 0, display: "flex", justifyContent: "flex-end", padding: "8px 12px 0" }}>
          <button
            onClick={() => dispatch({ type: "CLEAR_MESSAGES" })}
            style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: R.full, color: C.textMute, fontFamily: F.body, fontSize: "11px", padding: "4px 12px", cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.color = C.textSec)}
            onMouseLeave={e => (e.currentTarget.style.color = C.textMute)}
          >
            Clear chat
          </button>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {state.messages.length === 0 && !streamingContent && (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body, lineHeight: 1.6 }}>
              Ask Byuld anything about your code, or tap the <span style={{ color: C.purple }}>?</span> on a line in the editor.
            </div>
          </div>
        )}

        {state.messages.map((msg: Message, i) => (
          <ChatBubble key={i} role={msg.role} animate={false}>
            {msg.role === "byuld"
              ? <Markdown text={msg.content} />
              : <span style={{ whiteSpace: "pre-wrap", fontFamily: F.body, fontSize: "13px", color: C.textSec }}>{msg.content}</span>
            }
          </ChatBubble>
        ))}

        {/* Streaming bubble */}
        {streamingContent && (
          <ChatBubble role="byuld" animate={false}>
            <Markdown text={streamingContent} />
            <span style={{
              display: "inline-block", width: "2px", height: "13px",
              background: C.purple, marginLeft: "2px", verticalAlign: "text-bottom",
              animation: "blink 0.8s step-end infinite",
            }} />
          </ChatBubble>
        )}

        {loading && !streamingContent && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "4px 0 4px 4px" }}>
            <Spinner size={14} />
            <span style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body }}>Byuld is thinking…</span>
          </div>
        )}
        {/* Decision cards injected by BuildInterface */}
        {decisionSlot && (
          <div style={{ padding: "0 0 12px" }}>{decisionSlot}</div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "12px", borderTop: `1px solid ${C.border}`, background: C.surface }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask Byuld anything… (Enter to send)"
            rows={1}
            style={{
              flex: 1, padding: "9px 12px",
              background: C.surface2, border: `1px solid ${C.border}`,
              borderRadius: R.md, color: C.textPri, fontFamily: F.body,
              fontSize: "13px", outline: "none", resize: "none",
              lineHeight: 1.5, maxHeight: "100px", overflowY: "auto",
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            style={{
              padding: "9px 14px",
              background: input.trim() && !loading ? C.purple : C.surface2,
              border: "none", borderRadius: R.md,
              color: input.trim() && !loading ? "#fff" : C.textMute,
              cursor: input.trim() && !loading ? "pointer" : "not-allowed",
              fontSize: "13px", fontFamily: F.body, fontWeight: 600,
              transition: "all 0.15s", flexShrink: 0,
            }}
          >
            ↑
          </button>
        </div>
        <div style={{ marginTop: "6px", fontSize: "10px", color: C.textMute, fontFamily: F.body }}>
          Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}
