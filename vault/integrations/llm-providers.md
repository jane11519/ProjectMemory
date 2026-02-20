---
title: "LLM 與 Embedding 提供者設定"
tags: [LLM, embedding, OpenAI, openai-compatible, provider, api-key, baseUrl, reranker, text-embedding-3-small, gpt-4o-mini, NullLLMAdapter, EmbeddingConfig, LLMConfig]
source_kind: integration_doc
date: 2026-02-20
---

# LLM 與 Embedding 提供者設定

## 概覽 Overview

ProjectHub 使用兩種外部 AI 服務：
1. **Embedding**：將文字轉換為向量，用於語意搜尋（必要）
2. **LLM**：Query Expansion 和 Re-ranking，用於 deep search（可選）

兩者均透過 `.projecthub.json` 設定，API key 則透過 `.mcp.json` 的 env 欄位或系統環境變數提供。

## Embedding 設定

`.projecthub.json` 中的 `embedding` 區塊：

```json
{
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-small",
    "dimension": 1536,
    "maxBatchSize": 100
  }
}
```

| 參數 | 預設值 | 說明 |
|------|-------|------|
| `provider` | `"openai"` | 目前僅支援 OpenAI-compatible API |
| `model` | `"text-embedding-3-small"` | 嵌入模型名稱 |
| `dimension` | 1536 | 向量維度（須與模型匹配） |
| `maxBatchSize` | 100 | 單次 API 請求的最大文字數 |

### 常見 Embedding 模型

| 模型 | 維度 | 提供者 | 備註 |
|------|------|-------|------|
| `text-embedding-3-small` | 1536 | OpenAI | 預設，性價比高 |
| `text-embedding-3-large` | 3072 | OpenAI | 更高品質，成本較高 |
| `text-embedding-ada-002` | 1536 | OpenAI | 舊版模型 |
| 自訂模型 | 依模型 | 自架 / 第三方 | 需 OpenAI-compatible API |

### 維度變更注意事項

Embedding dimension 寫入 SQLite `schema_meta` 表追蹤。若 dimension 設定與已索引的資料不一致，`DatabaseManager` 會拋出錯誤：
```
Error: Embedding dimension mismatch: stored=1536, configured=768.
Please rebuild the index.
```

解決方式：刪除 `vault/.projecthub/index.db` 後重新執行 `index build`。

## LLM 設定

`.projecthub.json` 中的 `llm` 區塊：

```json
{
  "llm": {
    "provider": "none",
    "baseUrl": "https://api.openai.com/v1",
    "model": "gpt-4o-mini",
    "rerankerModel": "",
    "rerankerStrategy": "chat",
    "cacheTTLMs": 3600000
  }
}
```

| 參數 | 預設值 | 說明 |
|------|-------|------|
| `provider` | `"none"` | `"openai-compatible"` 啟用, `"none"` 停用 |
| `baseUrl` | `"https://api.openai.com/v1"` | API 端點 |
| `model` | `"gpt-4o-mini"` | Query Expansion 使用的 LLM 模型 |
| `rerankerModel` | `""` | Re-ranking 模型（空字串 = 使用 `model`） |
| `rerankerStrategy` | `"chat"` | Re-ranking 策略：`"chat"` 或 `"endpoint"` |
| `cacheTTLMs` | 3600000 | LLM 快取有效期（預設 1 小時） |

### provider: "none" — 無 LLM 模式

預設設定。系統注入 `NullLLMAdapter`，deep search 管線自動跳過 Query Expansion 和 Re-ranking。搜尋仍可使用 BM25 + Vector 的 RRF 融合。

### provider: "openai-compatible" — 啟用 LLM

支援任何 OpenAI-compatible API（包括 OpenAI、Azure OpenAI、本地 Ollama、vLLM 等）。

設定範例（OpenAI）：
```json
{
  "llm": {
    "provider": "openai-compatible",
    "baseUrl": "https://api.openai.com/v1",
    "model": "gpt-4o-mini"
  }
}
```

設定範例（本地 Ollama）：
```json
{
  "llm": {
    "provider": "openai-compatible",
    "baseUrl": "http://localhost:11434/v1",
    "model": "llama3.2"
  }
}
```

### Re-ranking 策略

| 策略 | API 端點 | 說明 | 適用場景 |
|------|---------|------|---------|
| `chat` | `/v1/chat/completions` | 使用 LLM prompt 對候選結果打分 | 通用 LLM（GPT-4o-mini 等） |
| `endpoint` | `/v1/rerank` | 呼叫專用 cross-encoder reranker API | 專用 reranker 模型（Cohere、Jina 等） |

`chat` 策略的 prompt 要求 LLM 對每個候選結果給出 0-10 的相關性分數，Adapter 正規化為 0.0-1.0。`endpoint` 策略直接呼叫 `/v1/rerank` API，適合部署了專用 reranker 模型的場景。

## API Key 設定

API key 透過環境變數提供，不寫入 `.projecthub.json`（安全考量）。

### 透過 .mcp.json env

```json
{
  "mcpServers": {
    "projecthub": {
      "command": "npx",
      "args": ["-y", "projecthub", "mcp"],
      "env": {
        "OPENAI_API_KEY": "${OPENAI_API_KEY}",
        "OPENAI_BASE_URL": "${OPENAI_BASE_URL}"
      }
    }
  }
}
```

`${OPENAI_API_KEY}` 會從系統環境變數解析。也可直接填入 key 值（但 `.mcp.json` 已被 `.gitignore` 排除）。

### 透過系統環境變數

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://api.openai.com/v1"
```

CLI 指令（如 `index build`、`search --mode deep`）直接讀取系統環境變數。

## LLM Cache

`HttpLLMAdapter` 使用 SQLite `llm_cache` 表快取 LLM 呼叫結果，避免重複的 API 請求。

- **Cache key**：操作類型 + 查詢字串 + 候選結果 hash
- **TTL**：`cacheTTLMs`（預設 3600000 = 1 小時）
- **自動清理**：查詢時自動刪除過期 entry
- **適用操作**：Query Expansion、Re-ranking

## 相關文件

- [錯誤處理與降級策略](../code-notes/error-handling.md) — 無 LLM / Embedding 失敗的降級行為
- [多階段搜尋管線](../code-notes/search-pipeline.md) — LLM 在 deep search 中的角色
- [基礎設施層轉接器](../code-notes/infrastructure-adapters.md) — HttpLLMAdapter 實作細節
- [Claude Code 整合指南](../integrations/claude-code-integration.md) — .mcp.json 設定
