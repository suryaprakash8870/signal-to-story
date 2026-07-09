-- Manual backend selection: a dropdown on the AI Provider card lets the user
-- pin the pipeline to a specific model instead of the automatic priority
-- chain. Null = auto (API → remote Ollama → local Ollama).
--   'auto'                                  → automatic fallback chain
--   'api'                                   → the stored API key (Gemini/Claude)
--   'ollama|<baseUrl>|<model>'              → a specific Ollama endpoint+model
alter table public.llm_config add column if not exists selected_backend text;
