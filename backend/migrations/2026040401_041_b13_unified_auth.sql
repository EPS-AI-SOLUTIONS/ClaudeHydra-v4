-- B13: Unified Auth — jaskier-auth integration for ClaudeHydra
-- Creates shared jaskier-auth tables if they don't already exist.
-- Old per-app OAuth tables were already dropped in migration 031.

-- Core user table (shared across all Jaskier apps in the same DB).
CREATE TABLE IF NOT EXISTS jaskier_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    email_verified BOOLEAN DEFAULT FALSE,
    name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'developer')),
    password_hash TEXT,
    google_sub TEXT,
    locale TEXT DEFAULT 'pl',
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    is_disabled BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_jaskier_users_email ON jaskier_users(email);
CREATE INDEX IF NOT EXISTS idx_jaskier_users_google_sub ON jaskier_users(google_sub);

-- OAuth provider connections (Google, GitHub, etc.).
CREATE TABLE IF NOT EXISTS jaskier_oauth_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES jaskier_users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS idx_jaskier_oauth_providers_user_id ON jaskier_oauth_providers(user_id);

-- User sessions (JWT refresh tokens).
CREATE TABLE IF NOT EXISTS jaskier_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES jaskier_users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL,
    user_agent TEXT,
    ip_address TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jaskier_sessions_user_id ON jaskier_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_jaskier_sessions_expires_at ON jaskier_sessions(expires_at);

-- Auth audit log.
CREATE TABLE IF NOT EXISTS jaskier_auth_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES jaskier_users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    provider TEXT,
    ip_address TEXT,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jaskier_auth_audit_user_id ON jaskier_auth_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_jaskier_auth_audit_created_at ON jaskier_auth_audit(created_at);

-- WebAuthn / Passkey credentials.
CREATE TABLE IF NOT EXISTS jaskier_webauthn_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES jaskier_users(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE,
    public_key BYTEA NOT NULL,
    counter BIGINT DEFAULT 0,
    name TEXT,
    transports TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_jaskier_webauthn_user_id ON jaskier_webauthn_credentials(user_id);

-- Email verification tokens.
CREATE TABLE IF NOT EXISTS jaskier_email_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES jaskier_users(id),
    new_email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON jaskier_email_verifications(token);
CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON jaskier_email_verifications(user_id);

-- Per-app role assignments (e.g. admin in ClaudeHydra).
CREATE TABLE IF NOT EXISTS jaskier_user_app_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES jaskier_users(id),
    app_id TEXT NOT NULL,
    app_role TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, app_id)
);
CREATE INDEX IF NOT EXISTS idx_user_app_roles_user_id ON jaskier_user_app_roles(user_id);

-- TOTP (2FA) secrets.
CREATE TABLE IF NOT EXISTS jaskier_totp_secrets (
    user_id UUID PRIMARY KEY REFERENCES jaskier_users(id),
    encrypted_secret TEXT NOT NULL,
    backup_codes_hash TEXT[],
    enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
