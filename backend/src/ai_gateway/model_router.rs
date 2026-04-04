// model_router.rs — Re-exports from jaskier-model-router shared crate
//
// All model routing logic (ModelRouter, ModelTier, ModelRoute, AiProvider,
// detect_provider, detect_tier, fallback chains) has been extracted to
// `crates/jaskier-model-router/` for reuse across all Hydra backends.
//
// We re-export individual items (not glob) to avoid ambiguous re-export
// warnings with vault_bridge::types.

pub use jaskier_model_router::{
    // Types
    AiProvider,
    // Functions
    DEFAULT_FALLBACK_CHAIN,
    ModelRoute,
    ModelRouter,
    ModelTier,
    ModelTiers,
    build_fallback_chain,
    default_provider_model_tiers,
    detect_provider,
    detect_tier,
    provider_priority,
};
