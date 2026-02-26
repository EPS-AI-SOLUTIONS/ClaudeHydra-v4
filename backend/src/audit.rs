// Jaskier Shared Pattern — audit
// #40 Audit log — fire-and-forget INSERT for tracking important actions.

/// Insert an audit log entry. Errors are logged but never propagated
/// (audit must not break the main request flow).
pub async fn log_audit(
    pool: &sqlx::PgPool,
    action: &str,
    details: serde_json::Value,
    ip: Option<&str>,
) {
    if let Err(e) = sqlx::query(
        "INSERT INTO ch_audit_log (action, details, ip_address) VALUES ($1, $2, $3)",
    )
    .bind(action)
    .bind(&details)
    .bind(ip)
    .execute(pool)
    .await
    {
        tracing::warn!("audit: failed to log action={}: {}", action, e);
    }
}
