use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

const LOG_TAIL_LIMIT: usize = 200;

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
    log_tail: Vec<String>,
}

fn push_log(logs: &Arc<Mutex<Vec<String>>>, message: String) {
    let mut lock = logs.lock().unwrap();
    lock.push(message);
    let overflow = lock.len().saturating_sub(LOG_TAIL_LIMIT);
    if overflow > 0 {
        lock.drain(0..overflow);
    }
}

#[tauri::command]
async fn check_server_runtime() -> bool {
    server_runtime_available()
}

fn server_runtime_available() -> bool {
    which::which("kenkui").is_ok()
}

fn server_command() -> Result<Command, String> {
    if let Ok(path) = which::which("kenkui") {
        let mut command = Command::new(path);
        command.arg("serve");
        return Ok(command);
    }

    Err("Could not find kenkui on PATH".to_string())
}

#[tauri::command]
async fn spawn_server(app: AppHandle, state: State<'_, ServerProcess>) -> Result<(), String> {
    {
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
    }

    let mut command = server_command()?;
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            let message = format!("Failed to spawn kenkui serve: {e}");
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
        for line in reader.lines() {
            match line {
                Ok(l) if l.contains("KENKUI_SERVER_READY") => {
                    push_log(&logs, l);
                    let _ = app_clone.emit("server-ready", ());
                    break;
                }
                Ok(l) => {
                    push_log(&logs, l);
                }
                Err(_) => {
                    let _ = app_clone.emit("server-error", "stdout closed unexpectedly");
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

    *state.child.lock().unwrap() = Some(child);
    *state.last_error.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
async fn kill_server(state: State<'_, ServerProcess>) -> Result<(), String> {
    let mut lock = state.child.lock().unwrap();
    if let Some(mut child) = lock.take() {
        child
            .kill()
            .map_err(|e| format!("Failed to kill kenkui process: {e}"))?;
        let _ = child.wait();
    }
    Ok(())
}

#[tauri::command]
async fn server_logs(state: State<'_, ServerProcess>) -> Result<Vec<String>, String> {
    Ok(state.logs.lock().unwrap().clone())
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
        log_tail: state.logs.lock().unwrap().clone(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(ServerProcess::default())
        .invoke_handler(tauri::generate_handler![
            check_server_runtime,
            spawn_server,
            kill_server,
            server_logs,
            server_status
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(state) = window.try_state::<ServerProcess>() {
                    let mut lock = state.child.lock().unwrap();
                    if let Some(mut child) = lock.take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
