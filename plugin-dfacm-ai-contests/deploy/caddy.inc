  # The AI collector keeps its read-only API; pages and feeds use /calendar.
  @aiCollectorApi path /ai-contests/api/* /ai-contests/healthz
  handle @aiCollectorApi {
    uri strip_prefix /ai-contests
    reverse_proxy http://127.0.0.1:8765 {
      header_up -Cookie
      header_up -Authorization
    }
  }
