import { useEffect, useRef, useState } from "react";
import {
  parseMarkdownTable,
  deriveTitle,
  stripTableMarkers,
} from "../utils/parseMarkdownTable";
import { injectCurrentDate } from "../utils/injectCurrentDate";
import BatchRunModal from "./BatchRunModal";
import { useLocation, useNavigate } from "react-router-dom";
import Box from "@mui/joy/Box";
import Button from "@mui/joy/Button";
import Chip from "@mui/joy/Chip";
import CircularProgress from "@mui/joy/CircularProgress";
import DialogActions from "@mui/joy/DialogActions";
import DialogContent from "@mui/joy/DialogContent";
import DialogTitle from "@mui/joy/DialogTitle";
import IconButton from "@mui/joy/IconButton";
import Input from "@mui/joy/Input";
import Modal from "@mui/joy/Modal";
import ModalClose from "@mui/joy/ModalClose";
import ModalDialog from "@mui/joy/ModalDialog";
import Sheet from "@mui/joy/Sheet";
import Textarea from "@mui/joy/Textarea";
import Tooltip from "@mui/joy/Tooltip";
import Typography from "@mui/joy/Typography";

const ACCEPTED_TYPES = ".json,.csv,.txt,.md,.xml,.yaml,.yml,.toml,.log";

function truncate(str, n = 100) {
  return str.length > n ? str.slice(0, n) + "…" : str;
}
const MAX_FILE_BYTES = 512 * 1024; // 512 KB per file

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message, onSaveReport, saveState = "idle" }) {
  const isUser = message.role === "user";
  const hasTable =
    !isUser &&
    !message.streaming &&
    !message.error &&
    message.content.includes("<DAY_TRADE_TABLE_START>");
  const displayContent = !isUser
    ? stripTableMarkers(message.content)
    : message.content;

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        px: 2,
        py: 0.5,
      }}
    >
      <Sheet
        variant="soft"
        color={isUser ? "primary" : "neutral"}
        sx={{
          maxWidth: "72%",
          px: 2,
          py: 1.25,
          borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
        }}
      >
        <Typography
          level="body-sm"
          sx={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}
        >
          {displayContent}
          {message.streaming && (
            <Box
              component="span"
              sx={{
                display: "inline-block",
                width: 8,
                height: 14,
                ml: 0.25,
                bgcolor: "text.primary",
                borderRadius: 1,
                animation: "blink 1s step-end infinite",
                "@keyframes blink": {
                  "0%, 100%": { opacity: 1 },
                  "50%": { opacity: 0 },
                },
                verticalAlign: "text-bottom",
              }}
            />
          )}
        </Typography>

        {/* Attachment chips shown on the user bubble */}
        {message.attachments?.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 1 }}>
            {message.attachments.map((a) => (
              <Chip
                key={a.name}
                size="sm"
                variant="outlined"
                startDecorator={<FileIcon />}
              >
                {a.name}
              </Chip>
            ))}
          </Box>
        )}

        {/* Save Report button — shown on assistant messages containing a table */}
        {hasTable && (
          <Box sx={{ mt: 1 }}>
            {saveState === "saved" ? (
              <Chip size="sm" color="success" variant="soft">
                Saved to Reports
              </Chip>
            ) : (
              <Button
                size="sm"
                variant="outlined"
                color="success"
                startDecorator={<TableIcon />}
                loading={saveState === "saving"}
                onClick={onSaveReport}
              >
                Save Report
              </Button>
            )}
          </Box>
        )}
      </Sheet>
    </Box>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
        opacity: 0.4,
      }}
    >
      <Typography level="h3">Stocks AI</Typography>
      <Typography level="body-sm">
        Ask me to analyze a stock or attach a JSON file to get started.
      </Typography>
    </Box>
  );
}

// ─── Main chat window ─────────────────────────────────────────────────────────

function ChatWindow({ selectedModel }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState([]); // [{name, content, mime_type}]
  const [fileError, setFileError] = useState("");
  const [promptPickerOpen, setPromptPickerOpen] = useState(false);
  const [reportSaveState, setReportSaveState] = useState({}); // msgIndex → 'idle'|'saving'|'saved'
  const [batchOpen, setBatchOpen] = useState(false);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const promptTitleRef = useRef(null);

  // Pre-populate from a saved prompt navigated here via the Run button
  useEffect(() => {
    const payload = location.state?.promptPayload;
    if (!payload) return;
    if (payload.text) setInput(injectCurrentDate(payload.text));
    if (payload.attachments?.length) {
      setAttachments((prev) => {
        const existing = new Set(prev.map((a) => a.name));
        return [
          ...prev,
          ...payload.attachments.filter((a) => !existing.has(a.name)),
        ];
      });
    }
    if (location.state?.promptTitle) {
      promptTitleRef.current = location.state.promptTitle;
    }
    // Clear router state so back-navigation doesn't re-populate
    navigate("/chat", { replace: true, state: null });
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handlePickPrompt(prompt) {
    if (prompt.text) {
      const text = injectCurrentDate(prompt.text);
      setInput((prev) => (prev ? prev + "\n" + text : text));
    }
    if (prompt.attachments?.length) {
      setAttachments((prev) => {
        const existing = new Set(prev.map((a) => a.name));
        return [
          ...prev,
          ...prompt.attachments.filter((a) => !existing.has(a.name)),
        ];
      });
    }
    setPromptPickerOpen(false);
  }

  function handleFileChange(e) {
    setFileError("");
    const files = Array.from(e.target.files);
    // Reset input so the same file can be re-attached after removal
    e.target.value = "";

    const readers = files.map(
      (file) =>
        new Promise((resolve, reject) => {
          if (file.size > MAX_FILE_BYTES) {
            reject(`"${file.name}" exceeds the 512 KB limit.`);
            return;
          }
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              name: file.name,
              content: reader.result,
              mime_type: file.type || "text/plain",
            });
          reader.onerror = () => reject(`Failed to read "${file.name}".`);
          reader.readAsText(file);
        }),
    );

    Promise.allSettled(readers).then((results) => {
      const ok = results
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value);
      const errors = results
        .filter((r) => r.status === "rejected")
        .map((r) => r.reason);

      if (errors.length) setFileError(errors.join(" "));

      setAttachments((prev) => {
        // Deduplicate by name
        const existing = new Set(prev.map((a) => a.name));
        return [...prev, ...ok.filter((a) => !existing.has(a.name))];
      });
    });
  }

  function removeAttachment(name) {
    setAttachments((prev) => prev.filter((a) => a.name !== name));
  }

  async function handleSaveReport(msgIndex, content) {
    const parsed = parseMarkdownTable(content);
    if (!parsed) {
      alert("No valid table found in this message.");
      return;
    }

    const { columns, rows } = parsed;
    const title = deriveTitle(columns);

    setReportSaveState((prev) => ({ ...prev, [msgIndex]: "saving" }));
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          columns,
          rows,
          source_prompt_title: promptTitleRef.current ?? null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Save failed");
      }
      setReportSaveState((prev) => ({ ...prev, [msgIndex]: "saved" }));
    } catch (err) {
      alert(`Failed to save report: ${err.message}`);
      setReportSaveState((prev) => ({ ...prev, [msgIndex]: "idle" }));
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || loading || !selectedModel)
      return;

    const userMessage = {
      role: "user",
      content: text || "(see attached files)",
      attachments:
        attachments.length > 0
          ? attachments.map(({ name }) => ({ name }))
          : undefined,
    };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput("");
    setAttachments([]);
    setFileError("");
    setLoading(true);

    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", streaming: true },
    ]);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          // Send only role+content to the API (no UI-only fields)
          messages: nextMessages.map(({ role, content }) => ({
            role,
            content,
          })),
          attachments,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail ?? `Server error ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const { content } = JSON.parse(data);
            if (content) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + content,
                };
                return updated;
              });
            }
          } catch {
            // malformed chunk — skip
          }
        }
      }

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          streaming: false,
        };
        return updated;
      });
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `Error: ${err.message}`,
          streaming: false,
          error: true,
        };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const canSend =
    (input.trim() || attachments.length > 0) && !!selectedModel && !loading;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        overflow: "hidden",
      }}
    >
      {/* Messages area */}
      <Box sx={{ flex: 1, overflowY: "auto", py: 2 }}>
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((msg, i) => (
            <MessageBubble
              key={i}
              message={msg}
              onSaveReport={() => handleSaveReport(i, msg.content)}
              saveState={reportSaveState[i] ?? "idle"}
            />
          ))
        )}
        <div ref={bottomRef} />
      </Box>

      {/* Input footer */}
      <Box
        sx={{
          borderTop: "1px solid",
          borderColor: "divider",
          px: 2,
          pt: 1,
          pb: 1.5,
          bgcolor: "background.surface",
        }}
      >
        {/* Pending attachment chips */}
        {attachments.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
            {attachments.map((a) => (
              <Chip
                key={a.name}
                size="sm"
                variant="soft"
                color="primary"
                startDecorator={<FileIcon />}
                endDecorator={
                  <Box
                    component="span"
                    onClick={() => removeAttachment(a.name)}
                    sx={{
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      opacity: 0.7,
                      "&:hover": { opacity: 1 },
                    }}
                  >
                    <CloseIcon />
                  </Box>
                }
              >
                {a.name}
              </Chip>
            ))}
          </Box>
        )}

        {/* File size / read error */}
        {fileError && (
          <Typography level="body-xs" color="danger" sx={{ mb: 0.5 }}>
            {fileError}
          </Typography>
        )}

        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            style={{ display: "none" }}
            onChange={handleFileChange}
          />

          {/* Saved prompts picker */}
          <Tooltip title="Insert saved prompt" placement="top">
            <IconButton
              size="sm"
              variant="plain"
              color="neutral"
              onClick={() => setPromptPickerOpen(true)}
              disabled={loading}
              sx={{ mb: 0.25 }}
            >
              <BookmarkIcon />
            </IconButton>
          </Tooltip>

          {/* Attach button */}
          <Tooltip title="Attach file (JSON, CSV, TXT…)" placement="top">
            <IconButton
              size="sm"
              variant="plain"
              color="neutral"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              sx={{ mb: 0.25 }}
            >
              <PaperclipIcon />
            </IconButton>
          </Tooltip>

          <Textarea
            minRows={1}
            maxRows={6}
            placeholder="Ask about a stock… (Shift+Enter for new line)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            sx={{ flex: 1, resize: "none" }}
          />

          <Tooltip title="Batch run" placement="top">
            <IconButton
              size="sm"
              variant="plain"
              color="success"
              onClick={() => setBatchOpen(true)}
              disabled={loading}
              sx={{ mb: 0.25 }}
            >
              <BatchIcon />
            </IconButton>
          </Tooltip>

          <IconButton
            onClick={sendMessage}
            disabled={!canSend}
            variant="solid"
            color="primary"
            sx={{ mb: 0.25 }}
          >
            {loading ? <CircularProgress size="sm" /> : <SendIcon />}
          </IconButton>
        </Box>
      </Box>

      <PromptPickerModal
        open={promptPickerOpen}
        onClose={() => setPromptPickerOpen(false)}
        onPick={handlePickPrompt}
      />

      <BatchRunModal
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        prompt={{ title: 'Chat Batch', text: input || '(see attached files)', attachments }}
        selectedModel={selectedModel}
      />
    </Box>
  );
}

// ─── Prompt picker modal ──────────────────────────────────────────────────────

function PromptPickerModal({ open, onClose, onPick }) {
  const [prompts, setPrompts] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setFetching(true);
    fetch("/api/prompts")
      .then((r) => r.json())
      .then(setPrompts)
      .catch(() => setPrompts([]))
      .finally(() => setFetching(false));
  }, [open]);

  const filtered = prompts.filter(
    (p) =>
      !search.trim() ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.text.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          width: { xs: "95vw", sm: 560 },
          maxHeight: "75vh",
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
        }}
      >
        <ModalClose />
        <DialogTitle>Insert a Saved Prompt</DialogTitle>

        <Input
          size="sm"
          placeholder="Search by title or content…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />

        <DialogContent sx={{ p: 0, overflowY: "auto" }}>
          {fetching ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size="sm" />
            </Box>
          ) : filtered.length === 0 ? (
            <Typography
              level="body-sm"
              textColor="neutral.500"
              sx={{ py: 4, textAlign: "center" }}
            >
              {search
                ? "No prompts match your search."
                : "No saved prompts yet."}
            </Typography>
          ) : (
            filtered.map((p) => (
              <Box
                key={p.id}
                onClick={() => onPick(p)}
                sx={{
                  px: 2,
                  py: 1.5,
                  cursor: "pointer",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  "&:hover": { bgcolor: "neutral.softHoverBg" },
                  "&:last-child": { borderBottom: "none" },
                }}
              >
                <Typography level="body-sm" fontWeight="lg">
                  {p.title}
                </Typography>
                <Typography level="body-xs" textColor="neutral.500" noWrap>
                  {truncate(p.text, 80)}
                </Typography>
                {p.attachments?.length > 0 && (
                  <Chip
                    size="sm"
                    variant="soft"
                    color="neutral"
                    sx={{ mt: 0.5 }}
                  >
                    {p.attachments.length} file
                    {p.attachments.length > 1 ? "s" : ""}
                  </Chip>
                )}
              </Box>
            ))
          )}
        </DialogContent>

        <DialogActions>
          <Button variant="plain" color="neutral" onClick={onClose}>
            Cancel
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}

// ─── Inline SVG icons ─────────────────────────────────────────────────────────

function TableIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="9" x2="9" y2="21" />
      <line x1="15" y1="9" x2="15" y2="21" />
    </svg>
  );
}

function BatchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="4" rx="1" />
      <rect x="2" y="10" width="20" height="4" rx="1" />
      <rect x="2" y="17" width="20" height="4" rx="1" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default ChatWindow;
