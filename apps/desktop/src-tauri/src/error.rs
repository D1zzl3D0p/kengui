/// Typed error enum for all Tauri command handlers.
///
/// Each variant corresponds to a distinct failure category. The `Display`
/// implementation (via `thiserror`) produces the exact same string that was
/// previously returned as a bare `String`, preserving frontend-visible messages.
///
/// `serde::Serialize` is implemented by serialising the `Display` output so
/// that Tauri still sends a plain error string to the JavaScript layer.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// File-system I/O failures (open, read, write, seek, metadata).
    #[error("{0}")]
    Io(String),

    /// JSON serialisation / deserialisation failures.
    // Retained as part of the failure taxonomy; currently unconstructed after
    // auth-session storage moved to opaque strings (no serde in the command).
    #[allow(dead_code)]
    #[error("{0}")]
    Serde(String),

    /// Process-spawn failures (uv install, server spawn, stdout/stderr capture).
    #[error("{0}")]
    Spawn(String),

    /// Process-management failures (try_wait, kill, signal).
    #[error("{0}")]
    Process(String),

    /// HTTP request/response failures (reqwest errors, non-2xx status).
    #[error("{0}")]
    Http(String),

    /// Authentication / keychain / OAuth-callback failures.
    #[error("{0}")]
    Auth(String),

    /// Server-runtime discovery and installation failures.
    #[error("{0}")]
    Runtime(String),

    /// Input-validation failures (bad URL scheme, path type checks, etc.).
    #[error("{0}")]
    Validation(String),
}

/// Serialise the error as its `Display` string so Tauri sends identical
/// error messages to the frontend as before.
impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
