use http::{header, Method};
use tower_governor::{governor::GovernorConfigBuilder, GovernorLayer};
use tower_http::cors::CorsLayer;
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::compression::CompressionLayer;
use tower_http::trace::TraceLayer;

use claudehydra_backend::model_registry;
use claudehydra_backend::state::AppState;
use claudehydra_backend::watchdog;

fn build_app(state: AppState) -> axum::Router {
    // CORS — allow Vite dev server + Vercel production
    let cors = CorsLayer::new()
        .allow_origin([
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
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
        .max_age(std::time::Duration::from_secs(86_400));

    // Rate limiting: 30 req burst, replenish 1 per 2 seconds, per IP
    // Jaskier Shared Pattern -- rate_limit
    let governor_conf = GovernorConfigBuilder::default()
        .per_second(2)
        .burst_size(30)
        .finish()
        .unwrap();

    claudehydra_backend::create_router(state)
        .layer(GovernorLayer::new(governor_conf))
        .layer(cors)
        .layer(SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            header::HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::X_FRAME_OPTIONS,
            header::HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::REFERRER_POLICY,
            header::HeaderValue::from_static("strict-origin-when-cross-origin"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::CONTENT_SECURITY_POLICY,
            header::HeaderValue::from_static(
                "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://generativelanguage.googleapis.com https://api.anthropic.com https://api.openai.com; img-src 'self' data: blob:",
            ),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::STRICT_TRANSPORT_SECURITY,
            header::HeaderValue::from_static("max-age=63072000; includeSubDomains"),
        ))
        .layer(TraceLayer::new_for_http())
        .layer(CompressionLayer::new())
}

// ── Shuttle deployment entry point ──────────────────────────────────
#[cfg(feature = "shuttle")]
#[shuttle_runtime::main]
async fn main() -> shuttle_axum::ShuttleAxum {
    dotenvy::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL required");
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(std::time::Duration::from_secs(3))
        .idle_timeout(std::time::Duration::from_secs(600))
        .max_lifetime(std::time::Duration::from_secs(1800))
        .connect(&database_url)
        .await
        .expect("DB connection failed");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Migrations failed");

    let state = AppState::new(pool);

    // ── Spawn system monitor (CPU/memory stats, refreshed every 5s) ──
    claudehydra_backend::system_monitor::spawn(state.system_monitor.clone());

    model_registry::startup_sync(&state).await;
    state.mark_ready();
    Ok(build_app(state).into())
}

// ── Local development entry point ───────────────────────────────────
#[cfg(not(feature = "shuttle"))]
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    use tracing_subscriber::EnvFilter;

    enable_ansi();

    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into());
    if std::env::var("RUST_LOG_FORMAT").as_deref() == Ok("json") {
        tracing_subscriber::fmt()
            .with_env_filter(env_filter)
            .json()
            .init();
    } else {
        tracing_subscriber::fmt()
            .with_env_filter(env_filter)
            .with_ansi(true)
            .init();
    }

    dotenvy::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL required");
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(std::time::Duration::from_secs(3))
        .idle_timeout(std::time::Duration::from_secs(600))
        .max_lifetime(std::time::Duration::from_secs(1800))
        .connect(&database_url)
        .await
        .expect("DB connection failed");
    // Skip migrations if schema already exists (avoids checksum mismatch)
    if let Err(e) = sqlx::migrate!("./migrations").run(&pool).await {
        tracing::warn!("Migration skipped (schema likely exists): {}", e);
    }

    let state = AppState::new(pool);

    // ── Spawn system monitor (CPU/memory stats, refreshed every 5s) ──
    claudehydra_backend::system_monitor::spawn(state.system_monitor.clone());

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

    print_banner(port);
    tracing::info!("ClaudeHydra v4 backend listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;

    Ok(())
}

// Jaskier Shared Pattern -- enable ANSI colors on Windows consoles
#[cfg(windows)]
fn enable_ansi() {
    use windows::Win32::System::Console::{
        GetConsoleMode, GetStdHandle, SetConsoleMode, ENABLE_VIRTUAL_TERMINAL_PROCESSING,
        STD_ERROR_HANDLE, STD_OUTPUT_HANDLE,
    };
    for std_handle in [STD_OUTPUT_HANDLE, STD_ERROR_HANDLE] {
        unsafe {
            let Ok(handle) = GetStdHandle(std_handle) else {
                continue;
            };
            let mut mode = Default::default();
            if GetConsoleMode(handle, &mut mode).is_ok() {
                let _ = SetConsoleMode(handle, mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
            }
        }
    }
}
#[cfg(not(windows))]
fn enable_ansi() {}

fn print_banner(port: u16) {
    // ClaudeHydra: bold yellow (33)
    println!();
    println!("  \x1b[1;33m>>>  CLAUDEHYDRA v4  <<<\x1b[0m");
    println!("  \x1b[33mAI Swarm Control Center\x1b[0m");
    println!("  \x1b[1;32mhttp://localhost:{port}\x1b[0m");
    println!();
}

async fn shutdown_signal() {
    let ctrl_c = tokio::signal::ctrl_c();
    #[cfg(unix)]
    {
        let mut sigterm = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler");
        tokio::select! {
            _ = ctrl_c => {},
            _ = sigterm.recv() => {},
        }
    }
    #[cfg(not(unix))]
    {
        ctrl_c.await.ok();
    }
    tracing::info!("Shutdown signal received, starting graceful shutdown");
}
