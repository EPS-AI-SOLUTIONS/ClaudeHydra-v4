use tower_http::cors::CorsLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::trace::TraceLayer;

use claudehydra_backend::model_registry;
use claudehydra_backend::state::AppState;
use claudehydra_backend::watchdog;

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

    tracing::info!("ClaudeHydra v4 backend listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
