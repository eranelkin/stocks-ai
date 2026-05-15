import { useEffect, useRef, useState } from "react";
import Box from "@mui/joy/Box";
import Button from "@mui/joy/Button";
import Chip from "@mui/joy/Chip";
import ChipDelete from "@mui/joy/ChipDelete";
import CircularProgress from "@mui/joy/CircularProgress";
import IconButton from "@mui/joy/IconButton";
import LinearProgress from "@mui/joy/LinearProgress";
import Option from "@mui/joy/Option";
import Select from "@mui/joy/Select";
import Sheet from "@mui/joy/Sheet";
import Textarea from "@mui/joy/Textarea";
import Tooltip from "@mui/joy/Tooltip";
import Typography from "@mui/joy/Typography";

import WebSearchBatchModal from "../components/WebSearchBatchModal";
import { injectCurrentDate } from "../utils/injectCurrentDate";
import { streamChat } from "../utils/streamChat";
import { useLocation, useNavigate } from "react-router-dom";

const ACCEPTED_TYPES = ".json,.csv,.txt,.md,.xml,.yaml,.yml,.toml,.log";
const MAX_FILE_BYTES = 512 * 1024;
const RETRYABLE_ERROR = "Failed to call a function. Please adjust your prompt.";
const MAX_ATTEMPTS = 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractList(jsonContent) {
  const parsed = JSON.parse(jsonContent);
  const list = parsed?.list;
  if (!Array.isArray(list))
    throw new Error('No array found at key "list" in the JSON file.');
  return list;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size)
    chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message }) {
  const isUser = message.role === "user";
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
        color={message.error ? "danger" : isUser ? "primary" : "neutral"}
        sx={{
          maxWidth: "72%",
          px: 2,
          py: 1.25,
          borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
        }}
      >
        <Typography
          level="body-sm"
          color={message.error ? "danger" : undefined}
          sx={{
            whiteSpace: "pre-wrap",
            lineHeight: 1.65,
            fontFamily: isUser ? "inherit" : "monospace",
          }}
        >
          {message.content}
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
      </Sheet>
    </Box>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WebSearchTestsPage({ selectedModels }) {
  const selectedModel = selectedModels?.[0] ?? "";
  const location = useLocation();
  const navigate = useNavigate();

  const [prompts, setPrompts] = useState([]);
  const [selectedPromptId, setSelectedPromptId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [fileError, setFileError] = useState("");
  const [loading, setLoading] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);

  // Inline batch progress state
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, label: "" });
  const [batchError, setBatchError] = useState("");
  const batchAbortRef = useRef(null);

  const fileInputRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Pre-populate from a prompt navigated here via the Web Search Tests button
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
    navigate("/web-search-tests", { replace: true, state: null });
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch("/api/prompts?category=personal")
      .then((r) => r.json())
      .then(setPrompts)
      .catch(() => {});
  }, []);

  function handlePromptSelect(_, promptId) {
    if (!promptId) return;
    const prompt = prompts.find((p) => p.id === promptId);
    if (!prompt) return;
    setSelectedPromptId(promptId);
    setInput(injectCurrentDate(prompt.text));
    setAttachments(prompt.attachments ?? []);
    setFileError("");
  }

  function handleFileChange(e) {
    setFileError("");
    const files = Array.from(e.target.files);
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
        const existing = new Set(prev.map((a) => a.name));
        return [...prev, ...ok.filter((a) => !existing.has(a.name))];
      });
    });
  }

  function removeAttachment(name) {
    setAttachments((prev) => prev.filter((a) => a.name !== name));
  }

  // ─── Batch execution (runs inline, no modal) ──────────────────────────────

  async function handleBatchStart({ chunkSize, activeJson }) {
    let itemsList;
    try {
      itemsList = extractList(activeJson.content);
    } catch (e) {
      setBatchError(`Could not parse JSON: ${e.message}`);
      return;
    }

    const chunks = chunkArray(itemsList, chunkSize);
    const totalChunks = chunks.length;
    const totalModels = selectedModels.length;
    const contextAttachments = attachments.filter(
      (a) => a.name !== activeJson.name,
    );
    const promptText = input || "(see attached files)";

    setBatchRunning(true);
    setBatchError("");
    setBatchProgress({ current: 0, total: totalChunks, label: "Starting…" });

    const controller = new AbortController();
    batchAbortRef.current = controller;

    for (let mi = 0; mi < selectedModels.length; mi++) {
      if (controller.signal.aborted) break;

      const modelId = selectedModels[mi];

      for (let i = 0; i < chunks.length; i++) {
        if (controller.signal.aborted) break;

        const chunkItems = chunks[i];
        const label =
          totalModels > 1
            ? `Model ${mi + 1}/${totalModels} — Chunk ${i + 1}/${totalChunks} (${chunkItems.length} items)`
            : `Chunk ${i + 1} of ${totalChunks} (${chunkItems.length} items)`;

        setBatchProgress({ current: i + 1, total: totalChunks, label });

        const chunkAttachment = {
          name: `chunk_${i + 1}.json`,
          content: JSON.stringify(chunkItems, null, 2),
          mime_type: "application/json",
        };

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          if (controller.signal.aborted) break;

          // Fresh streaming bubble for each attempt
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "", streaming: true },
          ]);

          try {
            const fullText = await streamChat({
              model: modelId,
              messages: [{ role: "user", content: injectCurrentDate(promptText) }],
              attachments: [...contextAttachments, chunkAttachment],
              enableWebSearch: true,
              signal: controller.signal,
              onToken: (token) => {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + token,
                  };
                  return updated;
                });
              },
            });

            // Defensive: error came through as streamed content
            if (fullText.includes(RETRYABLE_ERROR)) {
              throw new Error(fullText);
            }

            // Success — mark streaming done and move to next chunk
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                streaming: false,
              };
              return updated;
            });
            break; // exit retry loop

          } catch (err) {
            if (err.name === "AbortError") break;

            const isRetryable =
              err.message.includes(RETRYABLE_ERROR) ||
              err.message.includes("Failed to call a function");
            const isLastAttempt = attempt >= MAX_ATTEMPTS;

            const errorText = isRetryable
              ? isLastAttempt
                ? `⚠ All ${MAX_ATTEMPTS} attempts failed\n\n${err.message}`
                : `⚠ Attempt ${attempt}/${MAX_ATTEMPTS} — Retrying...\n\n${err.message}`
              : `⚠ ${err.message}`;

            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: errorText,
                streaming: false,
                error: true,
              };
              return updated;
            });

            if (!isRetryable || isLastAttempt) break; // next chunk
            // else: loop continues → new bubble on next attempt
          }
        }
      }
    }

    setBatchRunning(false);
    batchAbortRef.current = null;
  }

  function handleBatchCancel() {
    batchAbortRef.current?.abort();
    setBatchRunning(false);
    setBatchProgress({ current: 0, total: 0, label: "" });
  }

  // ─── Single message send ──────────────────────────────────────────────────

  async function sendMessage() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || loading || !selectedModel)
      return;

    setLoading(true);
    setInput("");

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text || "(see attached files)" },
    ]);
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
          messages: [
            {
              role: "user",
              content: text ? injectCurrentDate(text) : "(see attached files)",
            },
          ],
          attachments,
          enable_web_search: true,
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
    (input.trim() || attachments.length > 0) &&
    !!selectedModel &&
    !loading &&
    !batchRunning;

  const progressPct =
    batchProgress.total > 0
      ? (batchProgress.current / batchProgress.total) * 100
      : 0;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        overflow: "hidden",
      }}
    >
      {/* Prompt preset selector */}
      <Box
        sx={{
          px: 2,
          py: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "background.surface",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
        }}
      >
        <Typography level="body-xs" textColor="text.secondary" sx={{ flexShrink: 0 }}>
          Preset
        </Typography>
        <Select
          size="sm"
          placeholder="Select a prompt…"
          value={selectedPromptId}
          onChange={handlePromptSelect}
          disabled={loading || batchRunning}
          sx={{ flex: 1, maxWidth: 420 }}
        >
          {prompts.map((p) => (
            <Option key={p.id} value={p.id}>
              {p.title}
            </Option>
          ))}
        </Select>
      </Box>

      {/* Inline batch progress strip */}
      {(batchRunning || batchError) && (
        <Box
          sx={{
            px: 2,
            py: 1,
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: "background.surface",
            display: "flex",
            flexDirection: "column",
            gap: 0.75,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
              {batchRunning && <CircularProgress size="sm" />}
              <Typography
                level="body-sm"
                fontWeight="md"
                noWrap
                color={batchError ? "danger" : "neutral"}
              >
                {batchError || batchProgress.label}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
              {batchRunning && (
                <Chip size="sm" variant="soft" color="primary">
                  {batchProgress.current}/{batchProgress.total}
                </Chip>
              )}
              <Button
                size="sm"
                variant={batchError ? "solid" : "outlined"}
                color={batchError ? "neutral" : "danger"}
                onClick={() => {
                  handleBatchCancel();
                  setBatchError("");
                }}
              >
                {batchError ? "Dismiss" : "Cancel"}
              </Button>
            </Box>
          </Box>

          {batchRunning && (
            <LinearProgress
              determinate
              value={progressPct}
              sx={{ borderRadius: "sm" }}
            />
          )}
        </Box>
      )}

      {/* Messages area */}
      <Box sx={{ flex: 1, overflowY: "auto", py: 2 }}>
        {messages.length === 0 ? (
          <Box
            sx={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0.4,
            }}
          >
            <Typography level="body-sm">
              Send a prompt — web search is always on.
            </Typography>
          </Box>
        ) : (
          messages.map((msg, i) => <MessageBubble key={i} message={msg} />)
        )}
        <div ref={bottomRef} />
      </Box>

      {/* Clear button */}
      {messages.length > 0 && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            px: 2,
            pb: 0.5,
          }}
        >
          <Button
            size="sm"
            variant="plain"
            color="neutral"
            onClick={() => setMessages([])}
            disabled={batchRunning}
          >
            Clear
          </Button>
        </Box>
      )}

      {/* Input footer */}
      <Sheet
        sx={{
          borderTop: "1px solid",
          borderColor: "divider",
          px: 2,
          pt: 1,
          pb: 1.5,
          bgcolor: "background.surface",
        }}
      >
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
                  <ChipDelete onClick={() => removeAttachment(a.name)} />
                }
              >
                {a.name}
              </Chip>
            ))}
          </Box>
        )}

        {fileError && (
          <Typography level="body-xs" color="danger" sx={{ mb: 0.5 }}>
            {fileError}
          </Typography>
        )}

        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            style={{ display: "none" }}
            onChange={handleFileChange}
          />

          <Tooltip title="Attach file (JSON, CSV, TXT…)" placement="top">
            <IconButton
              size="sm"
              variant="plain"
              color="neutral"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || batchRunning}
              sx={{ mb: 0.25 }}
            >
              <PaperclipIcon />
            </IconButton>
          </Tooltip>

          <Textarea
            minRows={1}
            maxRows={6}
            placeholder="Enter prompt… (Shift+Enter for new line, web search always on)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading || batchRunning}
            sx={{ flex: 1, resize: "none" }}
          />

          <Tooltip title="Batch run" placement="top">
            <IconButton
              size="sm"
              variant="plain"
              color="success"
              onClick={() => setBatchOpen(true)}
              disabled={loading || batchRunning}
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
      </Sheet>

      <WebSearchBatchModal
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        prompt={{
          title: "Web Search Batch",
          text: input || "(see attached files)",
          attachments,
        }}
        selectedModels={selectedModels}
        onStartBatch={handleBatchStart}
      />
    </Box>
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

function BatchIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
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
