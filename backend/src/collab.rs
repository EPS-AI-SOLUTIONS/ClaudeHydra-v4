// ClaudeHydra — CRDT Real-time Collaboration integration module
//
// Integrates jaskier-collab with ClaudeHydra's AppState.
// Spawns the CRDT GC background worker at startup.

use std::sync::Arc;
use jaskier_collab::{CollabHub, gc::CrdtGarbageCollector};
use sqlx::PgPool;

/// Collaboration state attached to ClaudeHydra's AppState.
#[derive(Clone)]
pub struct CollabState {
    pub hub: Arc<CollabHub>,
}

impl CollabState {
    pub fn new() -> Self {
        Self {
            hub: Arc::new(CollabHub::new()),
        }
    }
}

impl Default for CollabState {
    fn default() -> Self {
        Self::new()
    }
}

/// Spawn the CRDT Garbage Collector background worker.
///
/// Runs every 5 minutes, compacting documents larger than 64KB
/// that have no active peers.
pub fn spawn_crdt_gc(db: PgPool, _hub: &CollabHub) {
    let gc = CrdtGarbageCollector::new();
    let (tx, _) = tokio::sync::broadcast::channel(256);

    gc.spawn(db, "ch_crdt_documents".to_string(), tx);

    tracing::info!("CRDT Garbage Collector spawned (interval: 5m, threshold: 64KB)");
}

/// Spawn the idle room cleanup task.
///
/// Closes collaboration rooms that have been empty for more than 30 minutes.
pub fn spawn_idle_room_cleanup(hub: Arc<CollabHub>) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
        loop {
            interval.tick().await;
            hub.close_idle_rooms(std::time::Duration::from_secs(1800)).await;
        }
    });

    tracing::info!("CRDT idle room cleanup spawned (check: 60s, max idle: 30m)");
}
