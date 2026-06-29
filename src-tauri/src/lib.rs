use std::env;
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(unix)]
use std::os::unix::process::CommandExt;

const LOG_TAIL_LIMIT: usize = 200;
const LOG_FILE_READ_LIMIT: u64 = 256 * 1024;
const LOCAL_SERVER_PORT: u16 = 45365;
const SHUTDOWN_GRACE_PERIOD: Duration = Duration::from_secs(5);
const SHUTDOWN_POLL_INTERVAL: Duration = Duration::from_millis(100);
const AUTH_SERVICE: &str = "app.kengui.desktop.auth";
const AUTH_ACCOUNT: &str = "supabase-session";

#[derive(Default)]
pub struct ServerProcess {
    child: Mutex<Option<Child>>,
    logs: Arc<Mutex<Vec<String>>>,
    last_error: Mutex<Option<String>>,
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
    let executable = if cfg!(windows) { "kenkui.exe" } else { "kenkui" };
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
    let mut file = File::open(path).map_err(|e| format!("Failed to open {}: {e}", path.display()))?;
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
        Some(format!("{command} pid {pid} is listening on port {LOCAL_SERVER_PORT}"))
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
        Err(format!("Output folder does not exist: {}", folder.display()))
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

fn startup_error_with_port_owner(message: String) -> String {
    match local_port_owner() {
        Some(owner) => format!("{message}. {owner}"),
        None => message,
    }
}

fn try_wait_for_exit(child: &mut Child) -> Result<bool, String> {
    child
        .try_wait()
        .map(|status| status.is_some())
        .map_err(|e| format!("Failed to inspect kenkui process: {e}"))
}

fn request_graceful_shutdown(child: &Child) -> Result<(), String> {
    #[cfg(unix)]
    {
        let status = Command::new("/bin/kill")
            .arg("-TERM")
            .arg(format!("-{}", child.id()))
            .status()
            .map_err(|e| format!("Failed to signal kenkui process: {e}"))?;
        if status.success() {
            return Ok(());
        }

        return Err(format!(
            "Failed to signal kenkui process: /bin/kill exited with {status}"
        ));
    }

    #[cfg(not(unix))]
    {
        let _ = child;
        Ok(())
    }
}

fn force_shutdown(child: &mut Child) -> Result<(), String> {
    child
        .kill()
        .map_err(|e| format!("Failed to kill kenkui process: {e}"))
}

fn shutdown_child(child: &mut Child) -> Result<(), String> {
    if try_wait_for_exit(child)? {
        return Ok(());
    }

    request_graceful_shutdown(child)?;

    let deadline = Instant::now() + SHUTDOWN_GRACE_PERIOD;
    while Instant::now() < deadline {
        if try_wait_for_exit(child)? {
            return Ok(());
        }
        thread::sleep(SHUTDOWN_POLL_INTERVAL);
    }

    force_shutdown(child)?;
    let _ = child.wait();
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
    if let Some(child) = lock.as_mut() {
        match child.try_wait() {
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
            let message = startup_error_with_port_owner(format!("Failed to spawn kenkui serve: {e}"));
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

    *lock = Some(child);
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
        if let Some(child) = lock.as_mut() {
            match child.try_wait() {
                Ok(None) => {
                    running = true;
                    pid = Some(child.id());
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
        Ok(Some(String::from_utf8_lossy(&output.stdout).trim().to_string()))
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
    if output.status.success() || String::from_utf8_lossy(&output.stderr).contains("could not be found") {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(ServerProcess::default())
        .invoke_handler(tauri::generate_handler![
            check_server_runtime,
            spawn_server,
            kill_server,
            server_logs,
            server_status,
            open_output_folder,
            save_auth_session,
            load_auth_session,
            clear_auth_session
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
        let path = std::env::temp_dir().join(format!(
            "kengui-log-tail-{}.log",
            std::process::id()
        ));
        std::fs::write(&path, "first\nsecond\nthird\nfourth\n").unwrap();

        let lines = tail_file(&path, 14).unwrap();

        assert_eq!(lines, vec!["third".to_string(), "fourth".to_string()]);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn output_folder_for_path_uses_parent_for_files() {
        let dir = std::env::temp_dir().join(format!(
            "kengui-output-folder-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("book.m4b");
        std::fs::write(&file, "").unwrap();

        assert_eq!(output_folder_for_path(&file).unwrap(), dir);

        let _ = std::fs::remove_file(file);
        let _ = std::fs::remove_dir(dir);
    }
}
