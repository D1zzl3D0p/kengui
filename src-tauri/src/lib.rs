use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

pub struct ServerProcess(pub Mutex<Option<Child>>);

#[tauri::command]
async fn check_kenkui() -> bool {
    which::which("kenkui").is_ok()
}

#[tauri::command]
async fn spawn_server(
    app: AppHandle,
    state: State<'_, ServerProcess>,
) -> Result<(), String> {
    let mut child = Command::new("kenkui")
        .arg("serve")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn kenkui: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or("Failed to capture kenkui stdout")?;

    let app_clone = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(l) if l.contains("KENKUI_SERVER_READY") => {
                    let _ = app_clone.emit("server-ready", ());
                    break;
                }
                Err(_) => {
                    let _ = app_clone.emit("server-error", "stdout closed unexpectedly");
                    break;
                }
                _ => {}
            }
        }
    });

    *state.0.lock().unwrap() = Some(child);
    Ok(())
}

#[tauri::command]
async fn kill_server(state: State<'_, ServerProcess>) -> Result<(), String> {
    let mut lock = state.0.lock().unwrap();
    if let Some(mut child) = lock.take() {
        child.kill().map_err(|e| format!("Failed to kill kenkui: {e}"))?;
        let _ = child.wait();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(ServerProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            check_kenkui,
            spawn_server,
            kill_server
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(state) = window.try_state::<ServerProcess>() {
                    let mut lock = state.0.lock().unwrap();
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
