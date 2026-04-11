//! ClaudeHydra model types — split into focused sub-modules.
//!
//! ## Sub-modules
//! - [`db_rows`]     — SQLx `FromRow` structs for raw DB query results
//! - [`chat_models`] — Chat, session, settings, system API types
//! - [`ws_protocol`] — WebSocket bidirectional protocol messages
//! - [`agent_models`] — WitcherAgent and agent CRUD request bodies
//!
//! All public types are re-exported from this module for backward compatibility.
//! Existing `use crate::models::*` imports continue to work unchanged.

pub mod agent_models;
pub mod chat_models;
pub mod db_rows;
pub mod ws_protocol;

// ── Re-exports for backward compatibility ─────────────────────────────────────
// All public types were previously defined directly in models.rs.
// These re-exports ensure `use crate::models::SomeType` still compiles.

pub use agent_models::*;
pub use chat_models::*;
pub use db_rows::*;
pub use ws_protocol::*;
