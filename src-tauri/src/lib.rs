use std::env;
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use reqwest::header::CONTENT_TYPE;
use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(unix)]
use std::os::unix::process::CommandExt;

#[cfg(unix)]
const WATCHDOG_ARG: &str = "--kengui-runtime-watchdog";
const LOG_TAIL_LIMIT: usize = 200;
const LOG_FILE_READ_LIMIT: u64 = 256 * 1024;
const LOCAL_SERVER_PORT: u16 = 45365;
const SHUTDOWN_GRACE_PERIOD: Duration = Duration::from_secs(5);
const SHUTDOWN_POLL_INTERVAL: Duration = Duration::from_millis(100);
const AUTH_CALLBACK_TIMEOUT: Duration = Duration::from_secs(300);
const AUTH_SERVICE: &str = "app.kengui.desktop.auth";
const AUTH_ACCOUNT: &str = "supabase-session";

#[derive(Default)]
pub struct ServerProcess {
    child: Mutex<Option<ManagedServer>>,
    logs: Arc<Mutex<Vec<String>>>,
    last_error: Mutex<Option<String>>,
}

struct ManagedServer {
    child: Child,
    #[cfg(unix)]
    process_group_id: u32,
    #[cfg(unix)]
    watchdog: Option<Child>,
}

#[derive(serde::Serialize)]
struct ServerStatus {
    available: bool,
    running: bool,
    pid: Option<u32>,
    last_error: Option<String>,
    port_owner: Option<String>,
    log_tail: Vec<String>,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthSession {
    access_token: String,
    refresh_token: String,
    expires_at: i64,
    email: Option<String>,
    provider: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeFileStat {
    path: String,
    filename: String,
    byte_size: u64,
    content_type: String,
}

fn redact_signed_url(value: &str) -> String {
    if value.contains("X-Amz-Signature")
        || value.contains("X-Amz-Credential")
        || value.contains("X-Amz-Security-Token")
    {
        "[REDACTED_SIGNED_URL]".to_string()
    } else {
        value.to_string()
    }
}

fn validate_signed_url(url: &str) -> Result<(), String> {
    if url.starts_with("https://") || url.starts_with("http://") {
        Ok(())
    } else {
        Err("Signed URL must be an HTTP(S) URL.".to_string())
    }
}

fn content_type_for_path(path: &Path) -> String {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "epub" => "application/epub+zip",
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        "json" => "application/json",
        _ => "application/octet-stream",
    }
    .to_string()
}

fn push_log(logs: &Arc<Mutex<Vec<String>>>, message: String) {
    let mut lock = logs.lock().unwrap();
    lock.push(message);
    let overflow = lock.len().saturating_sub(LOG_TAIL_LIMIT);
    if overflow > 0 {
        lock.drain(0..overflow);
    }
}

fn handle_stdout_line(
    line: String,
    ready_emitted: &mut bool,
    on_log: &mut impl FnMut(String),
    on_ready: &mut impl FnMut(),
) {
    let is_ready = line.contains("KENKUI_SERVER_READY");
    on_log(line);
    if is_ready && !*ready_emitted {
        *ready_emitted = true;
        on_ready();
    }
}

#[tauri::command]
async fn check_server_runtime() -> bool {
    ensure_server_runtime().is_ok()
}

fn server_runtime_available() -> bool {
    find_server_runtime().is_some()
}

fn uv_tool_bin_dir() -> Option<PathBuf> {
    if let Ok(path) = env::var("UV_TOOL_BIN_DIR") {
        return Some(PathBuf::from(path));
    }

    let home = env::var_os("HOME").or_else(|| env::var_os("USERPROFILE"))?;
    Some(PathBuf::from(home).join(".local").join("bin"))
}

fn uv_tool_kenkui_path() -> Option<PathBuf> {
    let executable = if cfg!(windows) {
        "kenkui.exe"
    } else {
        "kenkui"
    };
    uv_tool_bin_dir().map(|dir| dir.join(executable))
}

fn find_server_runtime() -> Option<PathBuf> {
    which::which("kenkui")
        .ok()
        .or_else(|| uv_tool_kenkui_path().filter(|path| path.exists()))
}

fn install_server_runtime() -> Result<PathBuf, String> {
    let uv_path = which::which("uv").map_err(|_| {
        "Could not find kenkui or uv on PATH. Install uv from https://docs.astral.sh/uv/ and restart Kengui.".to_string()
    })?;

    let output = Command::new(uv_path)
        .args(["tool", "install", "--upgrade", "kenkui"])
        .output()
        .map_err(|e| format!("Failed to run uv tool install --upgrade kenkui: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let details = if stderr.is_empty() { stdout } else { stderr };
        return Err(format!(
            "uv failed to install kenkui with status {}{}",
            output.status,
            if details.is_empty() {
                String::new()
            } else {
                format!(": {details}")
            }
        ));
    }

    find_server_runtime().ok_or_else(|| {
        "uv installed kenkui, but Kengui could not find the kenkui executable. Add uv's tool bin directory to PATH and restart Kengui.".to_string()
    })
}

fn ensure_server_runtime() -> Result<PathBuf, String> {
    find_server_runtime().map_or_else(install_server_runtime, Ok)
}

fn server_command() -> Result<Command, String> {
    let path = ensure_server_runtime()?;
    let mut command = Command::new(path);
    command.arg("serve");
    command.env("KENKUI_LOG_FILE", "1");
    command.env("PYTHONUNBUFFERED", "1");
    #[cfg(unix)]
    {
        command.process_group(0);
    }
    Ok(command)
}

#[cfg(unix)]
fn signal_process_group(signal: &str, process_group_id: u32) -> Result<(), String> {
    let status = Command::new("/bin/kill")
        .arg(format!("-{signal}"))
        .arg(format!("-{process_group_id}"))
        .status()
        .map_err(|e| format!("Failed to signal kenkui process group: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "Failed to signal kenkui process group: /bin/kill exited with {status}"
        ))
    }
}

#[cfg(unix)]
fn process_exists(pid: u32) -> bool {
    Command::new("/bin/kill")
        .arg("-0")
        .arg(pid.to_string())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

#[cfg(unix)]
fn process_group_exists(process_group_id: u32) -> bool {
    Command::new("/bin/kill")
        .arg("-0")
        .arg(format!("-{process_group_id}"))
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

#[cfg(unix)]
fn watchdog_main(parent_pid: u32, process_group_id: u32) {
    loop {
        if !process_group_exists(process_group_id) {
            return;
        }

        if !process_exists(parent_pid) {
            let _ = signal_process_group("TERM", process_group_id);
            let deadline = Instant::now() + SHUTDOWN_GRACE_PERIOD;
            while Instant::now() < deadline {
                if !process_group_exists(process_group_id) {
                    return;
                }
                thread::sleep(SHUTDOWN_POLL_INTERVAL);
            }
            let _ = signal_process_group("KILL", process_group_id);
            return;
        }

        thread::sleep(Duration::from_secs(1));
    }
}

#[cfg(unix)]
fn run_watchdog_from_args() -> bool {
    let mut args = env::args();
    let _exe = args.next();
    if args.next().as_deref() != Some(WATCHDOG_ARG) {
        return false;
    }

    let Some(parent_pid) = args.next().and_then(|value| value.parse::<u32>().ok()) else {
        return true;
    };
    let Some(process_group_id) = args.next().and_then(|value| value.parse::<u32>().ok()) else {
        return true;
    };

    watchdog_main(parent_pid, process_group_id);
    true
}

#[cfg(not(unix))]
fn run_watchdog_from_args() -> bool {
    false
}

#[cfg(unix)]
fn spawn_process_watchdog(process_group_id: u32) -> Option<Child> {
    let executable = env::current_exe().ok()?;
    Command::new(executable)
        .arg(WATCHDOG_ARG)
        .arg(std::process::id().to_string())
        .arg(process_group_id.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .ok()
}

fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn kenkui_log_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(xdg_state_home) = env::var("XDG_STATE_HOME") {
        dirs.push(PathBuf::from(xdg_state_home).join("kenkui"));
    }
    if let Some(home) = home_dir() {
        dirs.push(home.join(".local").join("state").join("kenkui"));
        dirs.push(home.join(".config").join("kenkui"));
    }
    dirs
}

fn log_file_candidates() -> Vec<PathBuf> {
    let mut files = Vec::new();
    for dir in kenkui_log_dirs() {
        files.push(dir.join("kenkui-server.log"));
        files.push(dir.join("kenkui-workers.log"));
    }
    files
}

fn tail_file(path: &Path, max_bytes: u64) -> Result<Vec<String>, String> {
    let mut file =
        File::open(path).map_err(|e| format!("Failed to open {}: {e}", path.display()))?;
    let len = file
        .metadata()
        .map_err(|e| format!("Failed to inspect {}: {e}", path.display()))?
        .len();
    let start = len.saturating_sub(max_bytes);
    file.seek(SeekFrom::Start(start))
        .map_err(|e| format!("Failed to seek {}: {e}", path.display()))?;
    let mut text = String::new();
    file.read_to_string(&mut text)
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    if start > 0 {
        if let Some(offset) = text.find('\n') {
            text = text[offset + 1..].to_string();
        }
    }
    Ok(text.lines().map(|line| line.to_string()).collect())
}

fn file_log_tail() -> Vec<String> {
    let mut lines = Vec::new();
    for path in log_file_candidates() {
        if !path.exists() {
            continue;
        }
        if let Ok(mut tail) = tail_file(&path, LOG_FILE_READ_LIMIT) {
            if !tail.is_empty() {
                lines.push(format!("== {} ==", path.display()));
                lines.append(&mut tail);
            }
        }
    }
    let overflow = lines.len().saturating_sub(LOG_TAIL_LIMIT);
    if overflow > 0 {
        lines.drain(0..overflow);
    }
    lines
}

fn combined_log_tail(logs: &Arc<Mutex<Vec<String>>>) -> Vec<String> {
    let mut lines = logs.lock().unwrap().clone();
    lines.extend(file_log_tail());
    let overflow = lines.len().saturating_sub(LOG_TAIL_LIMIT);
    if overflow > 0 {
        lines.drain(0..overflow);
    }
    lines
}

fn local_port_owner() -> Option<String> {
    let output = Command::new("/usr/sbin/lsof")
        .arg("-nP")
        .arg(format!("-iTCP:{LOCAL_SERVER_PORT}"))
        .arg("-sTCP:LISTEN")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout.lines().skip(1).find_map(|line| {
        let columns: Vec<&str> = line.split_whitespace().collect();
        if columns.len() < 2 {
            return None;
        }
        let command = columns[0];
        let pid = columns[1];
        Some(format!(
            "{command} pid {pid} is listening on port {LOCAL_SERVER_PORT}"
        ))
    })
}

fn output_folder_for_path(path: &Path) -> Result<PathBuf, String> {
    let folder = if path.is_dir() {
        path.to_path_buf()
    } else {
        path.parent()
            .ok_or_else(|| format!("Could not determine output folder for {}", path.display()))?
            .to_path_buf()
    };

    if folder.exists() {
        Ok(folder)
    } else {
        Err(format!(
            "Output folder does not exist: {}",
            folder.display()
        ))
    }
}

fn open_folder(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("/usr/bin/open");
        command.arg(path);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg(path);
        command
    };

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(path);
        command
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open {}: {e}", path.display()))
}

#[tauri::command]
async fn open_output_folder(path: String) -> Result<(), String> {
    let folder = output_folder_for_path(Path::new(&path))?;
    open_folder(&folder)
}

#[tauri::command]
async fn file_stat(path: String) -> Result<NativeFileStat, String> {
    let path_buf = PathBuf::from(&path);
    let metadata = std::fs::metadata(&path_buf)
        .map_err(|e| format!("Failed to inspect file metadata: {e}"))?;
    if !metadata.is_file() {
        return Err("Selected path is not a file.".to_string());
    }
    let filename = path_buf
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Selected file has no valid filename.".to_string())?
        .to_string();
    Ok(NativeFileStat {
        path,
        filename,
        byte_size: metadata.len(),
        content_type: content_type_for_path(&path_buf),
    })
}

#[tauri::command]
async fn signed_upload_file(path: String, url: String, content_type: String) -> Result<(), String> {
    validate_signed_url(&url)?;
    let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read upload file: {e}"))?;
    let response = reqwest::Client::new()
        .put(&url)
        .header(CONTENT_TYPE, content_type)
        .body(bytes)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Signed upload request failed: {}",
                redact_signed_url(&e.to_string())
            )
        })?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!(
            "Signed upload failed with status {}.",
            response.status()
        ))
    }
}

#[tauri::command]
async fn signed_upload_text(text: String, url: String, content_type: String) -> Result<(), String> {
    validate_signed_url(&url)?;
    let response = reqwest::Client::new()
        .put(&url)
        .header(CONTENT_TYPE, content_type)
        .body(text)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Signed upload request failed: {}",
                redact_signed_url(&e.to_string())
            )
        })?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!(
            "Signed upload failed with status {}.",
            response.status()
        ))
    }
}

#[tauri::command]
async fn signed_download_file(url: String, output_path: String) -> Result<(), String> {
    validate_signed_url(&url)?;
    let response = reqwest::Client::new().get(&url).send().await.map_err(|e| {
        format!(
            "Signed download request failed: {}",
            redact_signed_url(&e.to_string())
        )
    })?;
    if !response.status().is_success() {
        return Err(format!(
            "Signed download failed with status {}.",
            response.status()
        ));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read signed download response: {e}"))?;
    let output = PathBuf::from(output_path);
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create download folder: {e}"))?;
    }
    std::fs::write(&output, bytes).map_err(|e| format!("Failed to write signed download: {e}"))
}

fn startup_error_with_port_owner(message: String) -> String {
    match local_port_owner() {
        Some(owner) => format!("{message}. {owner}"),
        None => message,
    }
}

fn try_wait_for_exit(server: &mut ManagedServer) -> Result<bool, String> {
    server
        .child
        .try_wait()
        .map(|status| status.is_some())
        .map_err(|e| format!("Failed to inspect kenkui process: {e}"))
}

fn request_graceful_shutdown(server: &ManagedServer) -> Result<(), String> {
    #[cfg(unix)]
    {
        signal_process_group("TERM", server.process_group_id)
    }

    #[cfg(not(unix))]
    {
        let _ = server;
        Ok(())
    }
}

fn force_shutdown(server: &mut ManagedServer) -> Result<(), String> {
    #[cfg(unix)]
    {
        signal_process_group("KILL", server.process_group_id)
    }

    #[cfg(not(unix))]
    {
        server
            .child
            .kill()
            .map_err(|e| format!("Failed to kill kenkui process: {e}"))
    }
}

#[cfg(unix)]
fn cleanup_watchdog(server: &mut ManagedServer) {
    let Some(watchdog) = server.watchdog.as_mut() else {
        return;
    };

    let deadline = Instant::now() + Duration::from_secs(2);
    while Instant::now() < deadline {
        match watchdog.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => thread::sleep(SHUTDOWN_POLL_INTERVAL),
            Err(_) => return,
        }
    }

    let _ = watchdog.kill();
    let _ = watchdog.wait();
}

#[cfg(not(unix))]
fn cleanup_watchdog(_server: &mut ManagedServer) {}

fn shutdown_child(server: &mut ManagedServer) -> Result<(), String> {
    if try_wait_for_exit(server)? {
        cleanup_watchdog(server);
        return Ok(());
    }

    request_graceful_shutdown(server)?;

    let deadline = Instant::now() + SHUTDOWN_GRACE_PERIOD;
    while Instant::now() < deadline {
        if try_wait_for_exit(server)? {
            cleanup_watchdog(server);
            return Ok(());
        }
        thread::sleep(SHUTDOWN_POLL_INTERVAL);
    }

    force_shutdown(server)?;
    let _ = server.child.wait();
    cleanup_watchdog(server);
    Ok(())
}

fn shutdown_server_process(state: &ServerProcess) -> Result<(), String> {
    let mut lock = state.child.lock().unwrap();
    let Some(child) = lock.as_mut() else {
        return Ok(());
    };

    match shutdown_child(child) {
        Ok(()) => {
            lock.take();
            Ok(())
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
async fn spawn_server(app: AppHandle, state: State<'_, ServerProcess>) -> Result<(), String> {
    let mut lock = state.child.lock().unwrap();
    if let Some(server) = lock.as_mut() {
        match server.child.try_wait() {
            Ok(None) => return Ok(()),
            Ok(Some(_)) => {
                let _ = lock.take();
            }
            Err(error) => {
                let message = format!("Failed to inspect kenkui process: {error}");
                *state.last_error.lock().unwrap() = Some(message.clone());
                return Err(message);
            }
        }
    }

    let mut command = server_command()?;
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            let message =
                startup_error_with_port_owner(format!("Failed to spawn kenkui serve: {e}"));
            *state.last_error.lock().unwrap() = Some(message.clone());
            message
        })?;

    let stdout = child
        .stdout
        .take()
        .ok_or("Failed to capture kenkui stdout")?;

    let stderr = child
        .stderr
        .take()
        .ok_or("Failed to capture kenkui stderr")?;

    let app_clone = app.clone();
    let logs = state.logs.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let mut ready_emitted = false;
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    let mut on_log = |message: String| push_log(&logs, message);
                    let mut on_ready = || {
                        let _ = app_clone.emit("server-ready", ());
                    };
                    handle_stdout_line(l, &mut ready_emitted, &mut on_log, &mut on_ready);
                }
                Err(_) => {
                    if !ready_emitted {
                        let message = startup_error_with_port_owner(
                            "kenkui stdout closed before the server became ready".to_string(),
                        );
                        let _ = app_clone.emit("server-error", message);
                    }
                    break;
                }
            }
        }
    });

    let app_clone = app.clone();
    let logs = state.logs.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(message) = line {
                push_log(&logs, message.clone());
                let _ = app_clone.emit("server-log", message);
            }
        }
    });

    let process_group_id = child.id();
    #[cfg(unix)]
    let watchdog = spawn_process_watchdog(process_group_id);
    *lock = Some(ManagedServer {
        child,
        #[cfg(unix)]
        process_group_id,
        #[cfg(unix)]
        watchdog,
    });
    *state.last_error.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
async fn kill_server(state: State<'_, ServerProcess>) -> Result<(), String> {
    shutdown_server_process(&state)
}

#[tauri::command]
async fn server_logs(state: State<'_, ServerProcess>) -> Result<Vec<String>, String> {
    Ok(combined_log_tail(&state.logs))
}

#[tauri::command]
async fn server_status(state: State<'_, ServerProcess>) -> Result<ServerStatus, String> {
    let (running, pid) = {
        let mut lock = state.child.lock().unwrap();
        let mut running = false;
        let mut pid = None;
        if let Some(server) = lock.as_mut() {
            match server.child.try_wait() {
                Ok(None) => {
                    running = true;
                    pid = Some(server.child.id());
                }
                Ok(Some(_)) => {
                    let _ = lock.take();
                }
                Err(error) => {
                    *state.last_error.lock().unwrap() =
                        Some(format!("Failed to inspect kenkui process: {error}"));
                }
            }
        };
        (running, pid)
    };

    Ok(ServerStatus {
        available: server_runtime_available(),
        running,
        pid,
        last_error: state.last_error.lock().unwrap().clone(),
        port_owner: local_port_owner(),
        log_tail: combined_log_tail(&state.logs),
    })
}

#[cfg(target_os = "macos")]
fn security_output(args: &[&str]) -> Result<std::process::Output, String> {
    Command::new("/usr/bin/security")
        .args(args)
        .output()
        .map_err(|e| format!("Failed to access macOS Keychain: {e}"))
}

#[cfg(target_os = "macos")]
fn write_auth_session(session_json: &str) -> Result<(), String> {
    let _ = security_output(&[
        "delete-generic-password",
        "-s",
        AUTH_SERVICE,
        "-a",
        AUTH_ACCOUNT,
    ]);
    let output = security_output(&[
        "add-generic-password",
        "-s",
        AUTH_SERVICE,
        "-a",
        AUTH_ACCOUNT,
        "-w",
        session_json,
        "-U",
    ])?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[cfg(target_os = "macos")]
fn read_auth_session() -> Result<Option<String>, String> {
    let output = security_output(&[
        "find-generic-password",
        "-s",
        AUTH_SERVICE,
        "-a",
        AUTH_ACCOUNT,
        "-w",
    ])?;
    if output.status.success() {
        Ok(Some(
            String::from_utf8_lossy(&output.stdout).trim().to_string(),
        ))
    } else {
        Ok(None)
    }
}

#[cfg(target_os = "macos")]
fn delete_auth_session() -> Result<(), String> {
    let output = security_output(&[
        "delete-generic-password",
        "-s",
        AUTH_SERVICE,
        "-a",
        AUTH_ACCOUNT,
    ])?;
    if output.status.success()
        || String::from_utf8_lossy(&output.stderr).contains("could not be found")
    {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[cfg(not(target_os = "macos"))]
fn write_auth_session(_session_json: &str) -> Result<(), String> {
    Err("Secure auth storage is not implemented on this platform yet.".to_string())
}

#[cfg(not(target_os = "macos"))]
fn read_auth_session() -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(not(target_os = "macos"))]
fn delete_auth_session() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
async fn save_auth_session(session: AuthSession) -> Result<(), String> {
    let session_json = serde_json::to_string(&session)
        .map_err(|e| format!("Failed to serialize auth session: {e}"))?;
    write_auth_session(&session_json)
}

#[tauri::command]
async fn load_auth_session() -> Result<Option<AuthSession>, String> {
    let Some(session_json) = read_auth_session()? else {
        return Ok(None);
    };
    serde_json::from_str(&session_json)
        .map(Some)
        .map_err(|e| format!("Failed to parse stored auth session: {e}"))
}

#[tauri::command]
async fn clear_auth_session() -> Result<(), String> {
    delete_auth_session()
}

fn read_callback_target(stream: &mut TcpStream) -> Result<String, String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| format!("Failed to configure auth callback socket: {e}"))?;
    let mut buffer = [0; 8192];
    let read = stream
        .read(&mut buffer)
        .map_err(|e| format!("Failed to read auth callback request: {e}"))?;
    let request = String::from_utf8_lossy(&buffer[..read]);
    let request_line = request
        .lines()
        .next()
        .ok_or_else(|| "Auth callback request was empty.".to_string())?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let target = parts.next().unwrap_or_default();
    if method != "GET" || !target.starts_with("/auth/callback") {
        return Err("Auth callback request did not target /auth/callback.".to_string());
    }
    Ok(target.to_string())
}

fn write_callback_response(stream: &mut TcpStream, status: &str, body: &str) {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

#[tauri::command]
async fn start_auth_callback_listener(app: AppHandle) -> Result<String, String> {
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|e| format!("Failed to bind auth callback listener: {e}"))?;
    let addr = listener
        .local_addr()
        .map_err(|e| format!("Failed to read auth callback listener address: {e}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("Failed to configure auth callback listener: {e}"))?;
    let redirect_url = format!("http://127.0.0.1:{}/auth/callback", addr.port());
    let app_handle = app.clone();

    thread::spawn(move || {
        let deadline = Instant::now() + AUTH_CALLBACK_TIMEOUT;
        while Instant::now() < deadline {
            match listener.accept() {
                Ok((mut stream, _)) => match read_callback_target(&mut stream) {
                    Ok(target) => {
                        let callback_url =
                            format!("http://127.0.0.1:{}{}", addr.port(), target);
                        let _ = app_handle.emit("auth-callback", callback_url);
                        write_callback_response(
                            &mut stream,
                            "200 OK",
                            "<!doctype html><title>Kengui</title><p>Sign in complete. You can return to Kengui.</p>",
                        );
                        return;
                    }
                    Err(_) => {
                        write_callback_response(
                            &mut stream,
                            "404 Not Found",
                            "<!doctype html><title>Kengui</title><p>Not found.</p>",
                        );
                    }
                },
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(100));
                }
                Err(_) => return,
            }
        }
    });

    Ok(redirect_url)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if run_watchdog_from_args() {
        return;
    }

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(ServerProcess::default())
        .invoke_handler(tauri::generate_handler![
            check_server_runtime,
            spawn_server,
            kill_server,
            server_logs,
            server_status,
            open_output_folder,
            file_stat,
            signed_upload_file,
            signed_upload_text,
            signed_download_file,
            save_auth_session,
            load_auth_session,
            clear_auth_session,
            start_auth_callback_listener
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        tauri::RunEvent::WindowEvent {
            event: tauri::WindowEvent::CloseRequested { .. },
            ..
        }
        | tauri::RunEvent::ExitRequested { .. } => {
            if let Some(state) = app_handle.try_state::<ServerProcess>() {
                let _ = shutdown_server_process(&state);
            }
        }
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[test]
    fn handle_stdout_line_emits_ready_once_and_keeps_logging() {
        let mut ready_emitted = false;
        let logs = Arc::new(Mutex::new(Vec::new()));
        let ready_count = Arc::new(Mutex::new(0usize));
        let ready_count_clone = Arc::clone(&ready_count);

        let mut on_log = |message: String| push_log(&logs, message);
        let mut on_ready = || {
            *ready_count_clone.lock().unwrap() += 1;
        };

        handle_stdout_line(
            "booting".to_string(),
            &mut ready_emitted,
            &mut on_log,
            &mut on_ready,
        );
        handle_stdout_line(
            "KENKUI_SERVER_READY".to_string(),
            &mut ready_emitted,
            &mut on_log,
            &mut on_ready,
        );
        handle_stdout_line(
            "still running".to_string(),
            &mut ready_emitted,
            &mut on_log,
            &mut on_ready,
        );
        handle_stdout_line(
            "KENKUI_SERVER_READY".to_string(),
            &mut ready_emitted,
            &mut on_log,
            &mut on_ready,
        );

        assert_eq!(
            logs.lock().unwrap().as_slice(),
            &[
                "booting".to_string(),
                "KENKUI_SERVER_READY".to_string(),
                "still running".to_string(),
                "KENKUI_SERVER_READY".to_string(),
            ]
        );
        assert_eq!(*ready_count.lock().unwrap(), 1);
        assert!(ready_emitted);
    }

    #[test]
    fn tail_file_reads_bounded_complete_lines() {
        let path = std::env::temp_dir().join(format!("kengui-log-tail-{}.log", std::process::id()));
        std::fs::write(&path, "first\nsecond\nthird\nfourth\n").unwrap();

        let lines = tail_file(&path, 14).unwrap();

        assert_eq!(lines, vec!["third".to_string(), "fourth".to_string()]);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn output_folder_for_path_uses_parent_for_files() {
        let dir = std::env::temp_dir().join(format!("kengui-output-folder-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("book.m4b");
        std::fs::write(&file, "").unwrap();

        assert_eq!(output_folder_for_path(&file).unwrap(), dir);

        let _ = std::fs::remove_file(file);
        let _ = std::fs::remove_dir(dir);
    }

    #[test]
    fn content_type_for_path_allows_cloud_source_types() {
        assert_eq!(
            content_type_for_path(Path::new("book.epub")),
            "application/epub+zip"
        );
        assert_eq!(
            content_type_for_path(Path::new("book.pdf")),
            "application/pdf"
        );
        assert_eq!(content_type_for_path(Path::new("book.txt")), "text/plain");
    }

    #[test]
    fn redact_signed_url_removes_aws_signature_values() {
        let redacted = redact_signed_url(
            "https://bucket.example/object?X-Amz-Credential=abc&X-Amz-Signature=secret",
        );

        assert_eq!(redacted, "[REDACTED_SIGNED_URL]");
    }
}
