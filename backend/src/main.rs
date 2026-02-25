use tower_http::cors::CorsLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::trace::TraceLayer;

use claudehydra_backend::model_registry;
use claudehydra_backend::state::AppState;
use claudehydra_backend::watchdog;

// ── Windows-native CPU monitoring via GetSystemTimes ─────────────────
#[cfg(windows)]
fn filetime_to_u64(ft: &windows::Win32::Foundation::FILETIME) -> u64 {
    ((ft.dwHighDateTime as u64) << 32) | ft.dwLowDateTime as u64
}

#[cfg(windows)]
fn get_cpu_times() -> (u64, u64, u64) {
    use windows::Win32::Foundation::FILETIME;
    use windows::Win32::System::Threading::GetSystemTimes;
    let mut idle = FILETIME::default();
    let mut kernel = FILETIME::default();
    let mut user = FILETIME::default();
    unsafe {
        GetSystemTimes(Some(&mut idle), Some(&mut kernel), Some(&mut user)).unwrap();
    }
    (filetime_to_u64(&idle), filetime_to_u64(&kernel), filetime_to_u64(&user))
}

fn build_app(state: AppState) -> axum::Router {
    // CORS — allow Vite dev server + Vercel production
    let cors = CorsLayer::new()
        .allow_origin([
            "http://localhost:5177".parse().unwrap(),
            "http://127.0.0.1:5177".parse().unwrap(),
            "http://localhost:4173".parse().unwrap(),
            "http://localhost:5199".parse().unwrap(),
            "http://127.0.0.1:5199".parse().unwrap(),
            // GeminiHydra frontend (partner app cross-session access)
            "http://localhost:5176".parse().unwrap(),
            "http://127.0.0.1:5176".parse().unwrap(),
            "https://claudehydra-v4.vercel.app".parse().unwrap(),
            "https://claudehydra-v4-pawelserkowskis-projects.vercel.app"
                .parse()
                .unwrap(),
        ])
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    claudehydra_backend::create_router(state)
        .layer(cors)
        .layer(RequestBodyLimitLayer::new(10 * 1024 * 1024))
        .layer(TraceLayer::new_for_http())
}

// ── Shuttle deployment entry point ──────────────────────────────────
#[cfg(feature = "shuttle")]
#[shuttle_runtime::main]
async fn main() -> shuttle_axum::ShuttleAxum {
    dotenvy::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL required");
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("DB connection failed");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Migrations failed");

    let state = AppState::new(pool);

    // ── Background system monitor (CPU/memory every 5s) ──
    {
        let monitor = state.system_monitor.clone();
        tokio::spawn(async move {
            use claudehydra_backend::state::SystemSnapshot;

            let mut sys = sysinfo::System::new_all();

            #[cfg(windows)]
            let (mut prev_idle, mut prev_kernel, mut prev_user) = get_cpu_times();

            #[cfg(not(windows))]
            {
                sys.refresh_cpu_all();
                tokio::time::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL).await;
                sys.refresh_cpu_all();
            }

            loop {
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;

                #[cfg(windows)]
                let cpu = {
                    let (idle, kernel, user) = get_cpu_times();
                    let idle_diff = idle - prev_idle;
                    let kernel_diff = kernel - prev_kernel;
                    let user_diff = user - prev_user;
                    let total = kernel_diff + user_diff;
                    let c = if total > 0 {
                        ((total - idle_diff) as f32 / total as f32) * 100.0
                    } else {
                        0.0
                    };
                    prev_idle = idle;
                    prev_kernel = kernel;
                    prev_user = user;
                    c
                };

                #[cfg(not(windows))]
                let cpu = {
                    sys.refresh_cpu_all();
                    if sys.cpus().is_empty() {
                        0.0
                    } else {
                        sys.cpus().iter().map(|c| c.cpu_usage()).sum::<f32>()
                            / sys.cpus().len() as f32
                    }
                };

                sys.refresh_memory();

                let snap = SystemSnapshot {
                    cpu_usage_percent: cpu,
                    memory_used_mb: sys.used_memory() as f64 / 1_048_576.0,
                    memory_total_mb: sys.total_memory() as f64 / 1_048_576.0,
                    platform: std::env::consts::OS.to_string(),
                };

                *monitor.write().await = snap;
            }
        });
    }

    model_registry::startup_sync(&state).await;
    state.mark_ready();
    Ok(build_app(state).into())
}

// ── Local development entry point ───────────────────────────────────
#[cfg(not(feature = "shuttle"))]
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    use tracing_subscriber::EnvFilter;

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    dotenvy::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL required");
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("DB connection failed");
    // Skip migrations if schema already exists (avoids checksum mismatch)
    if let Err(e) = sqlx::migrate!("./migrations").run(&pool).await {
        tracing::warn!("Migration skipped (schema likely exists): {}", e);
    }

    let state = AppState::new(pool);

    // ── Background system monitor (CPU/memory every 5s) ──
    {
        let monitor = state.system_monitor.clone();
        tokio::spawn(async move {
            use claudehydra_backend::state::SystemSnapshot;

            let mut sys = sysinfo::System::new_all();

            #[cfg(windows)]
            let (mut prev_idle, mut prev_kernel, mut prev_user) = get_cpu_times();

            #[cfg(not(windows))]
            {
                sys.refresh_cpu_all();
                tokio::time::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL).await;
                sys.refresh_cpu_all();
            }

            loop {
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;

                #[cfg(windows)]
                let cpu = {
                    let (idle, kernel, user) = get_cpu_times();
                    let idle_diff = idle - prev_idle;
                    let kernel_diff = kernel - prev_kernel;
                    let user_diff = user - prev_user;
                    let total = kernel_diff + user_diff;
                    let c = if total > 0 {
                        ((total - idle_diff) as f32 / total as f32) * 100.0
                    } else {
                        0.0
                    };
                    prev_idle = idle;
                    prev_kernel = kernel;
                    prev_user = user;
                    c
                };

                #[cfg(not(windows))]
                let cpu = {
                    sys.refresh_cpu_all();
                    if sys.cpus().is_empty() {
                        0.0
                    } else {
                        sys.cpus().iter().map(|c| c.cpu_usage()).sum::<f32>()
                            / sys.cpus().len() as f32
                    }
                };

                sys.refresh_memory();

                let snap = SystemSnapshot {
                    cpu_usage_percent: cpu,
                    memory_used_mb: sys.used_memory() as f64 / 1_048_576.0,
                    memory_total_mb: sys.total_memory() as f64 / 1_048_576.0,
                    platform: std::env::consts::OS.to_string(),
                };

                *monitor.write().await = snap;
            }
        });
    }

    // ── Non-blocking startup: model sync in background ──
    let startup_state = state.clone();
    tokio::spawn(async move {
        let sync_timeout = std::time::Duration::from_secs(90);
        match tokio::time::timeout(sync_timeout, model_registry::startup_sync(&startup_state)).await
        {
            Ok(()) => tracing::info!("startup: model registry sync complete"),
            Err(_) => tracing::error!(
                "startup: model registry sync timed out after {}s — using fallback models",
                sync_timeout.as_secs()
            ),
        }
        startup_state.mark_ready();
    });

    // ── Spawn background watchdog ──
    let _watchdog = watchdog::spawn(state.clone());

    let app = build_app(state);

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8082".to_string())
        .parse()?;
    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));

    tracing::info!("ClaudeHydra v4 backend listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
