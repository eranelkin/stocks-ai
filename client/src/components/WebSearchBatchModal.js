import { useEffect, useRef, useState } from "react";
import Box from "@mui/joy/Box";
import Button from "@mui/joy/Button";
import Chip from "@mui/joy/Chip";
import DialogActions from "@mui/joy/DialogActions";
import DialogContent from "@mui/joy/DialogContent";
import DialogTitle from "@mui/joy/DialogTitle";
import FormControl from "@mui/joy/FormControl";
import FormHelperText from "@mui/joy/FormHelperText";
import FormLabel from "@mui/joy/FormLabel";
import Input from "@mui/joy/Input";
import Modal from "@mui/joy/Modal";
import ModalClose from "@mui/joy/ModalClose";
import ModalDialog from "@mui/joy/ModalDialog";
import Typography from "@mui/joy/Typography";

// ─── Component ────────────────────────────────────────────────────────────────

export default function WebSearchBatchModal({
  open,
  onClose,
  prompt,
  selectedModels = [],
  onStartBatch,
}) {
  const fileInputRef = useRef(null);

  const [chunkSize, setChunkSize] = useState(10);
  const [chunkSizeError, setChunkSizeError] = useState("");
  const [overrideJson, setOverrideJson] = useState(null);
  const [modelsMap, setModelsMap] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/ai/models")
      .then((r) => r.json())
      .then((data) => {
        const map = {};
        data.forEach((m) => { map[m.id] = m; });
        setModelsMap(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      setChunkSize(10);
      setChunkSizeError("");
      setOverrideJson(null);
      setError("");
    }
  }, [open]);

  const savedJson =
    prompt?.attachments?.find(
      (a) => a.name.endsWith(".json") || a.mime_type === "application/json",
    ) ?? null;
  const activeJson = overrideJson ?? savedJson;

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      setOverrideJson({
        name: file.name,
        content: reader.result,
        mime_type: "application/json",
      });
    reader.readAsText(file);
  }

  function handleStart() {
    const size = parseInt(chunkSize, 10);
    if (!size || size < 1) {
      setChunkSizeError("Must be at least 1");
      return;
    }
    if (!activeJson) {
      setError("No JSON file found. Upload a JSON file containing a list of items.");
      return;
    }
    if (selectedModels.length === 0) {
      setError("No model selected. Select at least one model in the header.");
      return;
    }
    onStartBatch({ chunkSize: size, activeJson });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: { xs: "95vw", sm: 520 } }}>
        <ModalClose />
        <DialogTitle>Batch Run — {prompt?.title}</DialogTitle>

        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
        >
          {/* JSON file selector */}
          <Box>
            <Typography
              level="body-xs"
              fontWeight="md"
              textColor="neutral.500"
              sx={{ mb: 0.75 }}
            >
              DATA FILE (JSON — must have a "list" key)
            </Typography>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={handleFileSelect}
            />

            {activeJson ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Chip
                  size="sm"
                  variant="soft"
                  color={overrideJson ? "success" : "primary"}
                  endDecorator={
                    overrideJson && (
                      <Box
                        component="span"
                        onClick={() => setOverrideJson(null)}
                        sx={{
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          opacity: 0.7,
                          "&:hover": { opacity: 1 },
                        }}
                      >
                        <SmallCloseIcon />
                      </Box>
                    )
                  }
                >
                  {activeJson.name}
                  {overrideJson && " (replaced)"}
                </Chip>
                <Button
                  size="sm"
                  variant="plain"
                  color="neutral"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Replace file
                </Button>
              </Box>
            ) : (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography level="body-sm" textColor="warning.400">
                  No JSON file attached.
                </Typography>
                <Button
                  size="sm"
                  variant="outlined"
                  color="neutral"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload file
                </Button>
              </Box>
            )}
          </Box>

          {/* Models summary */}
          {selectedModels?.length > 0 && (
            <Box>
              <Typography
                level="body-xs"
                fontWeight="md"
                textColor="neutral.500"
                sx={{ mb: 0.75 }}
              >
                MODELS ({selectedModels?.length})
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {selectedModels.map((id) => (
                  <Chip key={id} size="sm" variant="soft" color="primary">
                    {modelsMap[id]?.name ?? id}
                  </Chip>
                ))}
              </Box>
            </Box>
          )}

          {/* Chunk size */}
          <FormControl error={!!chunkSizeError}>
            <FormLabel>Chunk size</FormLabel>
            <Input
              type="number"
              value={chunkSize}
              onChange={(e) => {
                setChunkSize(e.target.value);
                setChunkSizeError("");
              }}
              slotProps={{ input: { min: 1, max: 100 } }}
              sx={{ width: 120 }}
            />
            {chunkSizeError ? (
              <FormHelperText>{chunkSizeError}</FormHelperText>
            ) : (
              <FormHelperText>Items per AI call (default 10)</FormHelperText>
            )}
          </FormControl>

          {error && (
            <Typography level="body-sm" color="danger">
              {error}
            </Typography>
          )}
        </DialogContent>

        <DialogActions>
          <Button variant="plain" color="neutral" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleStart}
            disabled={!activeJson || selectedModels.length === 0}
          >
            Start Batch
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}

function SmallCloseIcon() {
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
